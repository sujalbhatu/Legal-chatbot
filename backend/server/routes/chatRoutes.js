const express = require('express');
const axios = require('axios');
const ChatSession = require('../models/ChatSession');
const authMiddleware = require('../middleware/auth');

const router = express.Router();
const RAG_API_URL = process.env.RAG_API_URL || 'http://localhost:5000';

// All chat routes require authentication
router.use(authMiddleware);

// GET /api/chat/sessions — list user's sessions
router.get('/sessions', async (req, res) => {
    try {
        const sessions = await ChatSession.find({ userId: req.userId })
            .select('title isSolved createdAt updatedAt messages')
            .sort({ updatedAt: -1 });

        // Add message count and last message preview
        const formatted = sessions.map(s => ({
            _id: s._id,
            title: s.title,
            isSolved: s.isSolved,
            messageCount: s.messages.length,
            lastMessage: s.messages.length > 0
                ? s.messages[s.messages.length - 1].content.substring(0, 100)
                : '',
            createdAt: s.createdAt,
            updatedAt: s.updatedAt
        }));

        res.json({ sessions: formatted });
    } catch (err) {
        console.error('List sessions error:', err);
        res.status(500).json({ error: 'Failed to fetch sessions.' });
    }
});

// POST /api/chat/sessions — create new session
router.post('/sessions', async (req, res) => {
    try {
        const { title } = req.body;

        const session = new ChatSession({
            userId: req.userId,
            title: title || 'New Legal Query'
        });
        await session.save();

        res.status(201).json({ session });
    } catch (err) {
        console.error('Create session error:', err);
        res.status(500).json({ error: 'Failed to create session.' });
    }
});

// GET /api/chat/sessions/:id — get session with messages
router.get('/sessions/:id', async (req, res) => {
    try {
        const session = await ChatSession.findOne({
            _id: req.params.id,
            userId: req.userId
        });

        if (!session) {
            return res.status(404).json({ error: 'Session not found.' });
        }

        res.json({ session });
    } catch (err) {
        console.error('Get session error:', err);
        res.status(500).json({ error: 'Failed to fetch session.' });
    }
});

// PUT /api/chat/sessions/:id/solve — mark as solved
router.put('/sessions/:id/solve', async (req, res) => {
    try {
        const session = await ChatSession.findOneAndUpdate(
            { _id: req.params.id, userId: req.userId },
            { isSolved: true },
            { new: true }
        );

        if (!session) {
            return res.status(404).json({ error: 'Session not found.' });
        }

        res.json({ session });
    } catch (err) {
        console.error('Solve session error:', err);
        res.status(500).json({ error: 'Failed to update session.' });
    }
});

// DELETE /api/chat/sessions/:id — delete session
router.delete('/sessions/:id', async (req, res) => {
    try {
        const session = await ChatSession.findOneAndDelete({
            _id: req.params.id,
            userId: req.userId
        });

        if (!session) {
            return res.status(404).json({ error: 'Session not found.' });
        }

        res.json({ message: 'Session deleted.' });
    } catch (err) {
        console.error('Delete session error:', err);
        res.status(500).json({ error: 'Failed to delete session.' });
    }
});

// POST /api/chat/sessions/:id/query — send query to RAG with multilingual support
router.post('/sessions/:id/query', async (req, res) => {
    try {
        const { query, language } = req.body;

        if (!query || !query.trim()) {
            return res.status(400).json({ error: 'Query cannot be empty.' });
        }

        const session = await ChatSession.findOne({
            _id: req.params.id,
            userId: req.userId
        });

        if (!session) {
            return res.status(404).json({ error: 'Session not found.' });
        }

        // Build chat history for multi-turn
        const chatHistory = session.messages.map(m => ({
            role: m.role,
            content: m.content
        }));

        // Call RAG API with multilingual support
        let ragResponse;
        try {
            const payload = {
                query: query.trim(),
                chat_history: chatHistory
            };
            
            // Include language if provided (optional - RAG API will auto-detect if not provided)
            if (language && ['en', 'hi', 'bn', 'sat'].includes(language)) {
                payload.language = language;
            }

            const response = await axios.post(`${RAG_API_URL}/api/query`, payload, { timeout: 60000 });

            ragResponse = response.data;
        } catch (ragError) {
            console.error('RAG API error:', ragError.message);
            return res.status(503).json({
                error: 'The AI service is currently unavailable. Please try again later.'
            });
        }

        // Auto-generate title from first query
        if (session.messages.length === 0) {
            session.title = query.trim().substring(0, 80);
        }

        // Add user message
        session.messages.push({
            role: 'user',
            content: query.trim(),
            sources: [],
            language: ragResponse.language || 'en'
        });

        // Add assistant response
        session.messages.push({
            role: 'assistant',
            content: ragResponse.answer || 'I apologize, but I was unable to generate a response.',
            sources: ragResponse.sources || [],
            language: ragResponse.language || 'en'
        });

        await session.save();

        // Return the last two messages
        const lastMessages = session.messages.slice(-2);

        res.json({
            messages: lastMessages,
            language: ragResponse.language,
            language_name: ragResponse.language_name,
            session: {
                _id: session._id,
                title: session.title,
                messageCount: session.messages.length
            }
        });
    } catch (err) {
        console.error('Query error:', err);
        res.status(500).json({ error: 'Failed to process query.' });
    }
});

module.exports = router;
