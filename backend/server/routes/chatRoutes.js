const express = require('express');
const axios = require('axios');
const mongoose = require('mongoose');
const ChatSession = require('../models/ChatSession');
const authMiddleware = require('../middleware/auth');
const { proxyRagStream, RAG_API_URL } = require('../utils/ragStream');

const router = express.Router();

// Every query costs LLM calls, so one request can't be arbitrarily long
const MAX_QUERY_CHARS = 2000;

// All chat routes require authentication
router.use(authMiddleware);

// A malformed id is "not found", not a 500 from a Mongoose CastError
const validId = (label) => (req, res, next, id) => {
    if (!mongoose.isValidObjectId(id)) {
        return res.status(404).json({ error: `${label} not found.` });
    }
    next();
};
router.param('id', validId('Session'));
router.param('messageId', validId('Message'));

// GET /api/chat/sessions — list user's sessions
// Projection in MongoDB: only the count and a preview of the last message leave the
// database, instead of every message of every session.
router.get('/sessions', async (req, res) => {
    try {
        const sessions = await ChatSession.aggregate([
            { $match: { userId: new mongoose.Types.ObjectId(req.userId) } },
            { $sort: { updatedAt: -1 } },
            {
                $project: {
                    title: 1, isSolved: 1, createdAt: 1, updatedAt: 1,
                    messageCount: { $size: '$messages' },
                    lastMessage: {
                        $substrCP: [
                            { $ifNull: [{ $arrayElemAt: ['$messages.content', -1] }, ''] }, 0, 240
                        ]
                    },
                    // sections the answers actually cited, for the dashboard's case cards
                    citations: {
                        $slice: [{
                            $reduce: {
                                input: '$messages',
                                initialValue: [],
                                in: {
                                    $concatArrays: ['$$value', {
                                        $map: {
                                            input: {
                                                $filter: {
                                                    input: { $ifNull: ['$$this.sources', []] },
                                                    as: 's', cond: { $eq: ['$$s.cited', true] }
                                                }
                                            },
                                            as: 's', in: { act: '$$s.act_name', section: '$$s.section' }
                                        }
                                    }]
                                }
                            }
                        }, 20]
                    }
                }
            }
        ]);
        res.json({ sessions });
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
            title: typeof title === 'string' && title.trim() ? title.trim().slice(0, 120) : 'New Legal Query'
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
        const session = await ChatSession.findOne({ _id: req.params.id, userId: req.userId });
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
        const session = await ChatSession.findOneAndDelete({ _id: req.params.id, userId: req.userId });
        if (!session) {
            return res.status(404).json({ error: 'Session not found.' });
        }
        res.json({ message: 'Session deleted.' });
    } catch (err) {
        console.error('Delete session error:', err);
        res.status(500).json({ error: 'Failed to delete session.' });
    }
});

// PUT /api/chat/sessions/:id/reopen — reopen a solved session
router.put('/sessions/:id/reopen', async (req, res) => {
    try {
        const session = await ChatSession.findOneAndUpdate(
            { _id: req.params.id, userId: req.userId },
            { isSolved: false },
            { new: true }
        );
        if (!session) {
            return res.status(404).json({ error: 'Session not found.' });
        }
        res.json({ session });
    } catch (err) {
        console.error('Reopen session error:', err);
        res.status(500).json({ error: 'Failed to reopen session.' });
    }
});

/**
 * Validate the query and load the session. Returns { session, payload, summarizedCount }
 * or sends the error response and returns null.
 */
async function prepareQuery(req, res) {
    const { query, language } = req.body;
    if (typeof query !== 'string' || !query.trim()) {
        res.status(400).json({ error: 'Query cannot be empty.' });
        return null;
    }
    if (query.length > MAX_QUERY_CHARS) {
        res.status(400).json({ error: `Query is too long (max ${MAX_QUERY_CHARS} characters).` });
        return null;
    }
    const session = await ChatSession.findOne({ _id: req.params.id, userId: req.userId });
    if (!session) {
        res.status(404).json({ error: 'Session not found.' });
        return null;
    }

    // Short-term memory: only the messages not yet folded into the long-term summary
    const summarizedCount = Math.min(session.summarizedCount || 0, session.messages.length);
    const payload = {
        query: query.trim(),
        chat_history: session.messages.slice(summarizedCount).map(m => ({ role: m.role, content: m.content, language: m.language })),
        memory_summary: session.memorySummary || ''
    };
    // Language picked in the UI ('auto' or missing = detect from the message)
    if (typeof language === 'string' && ChatSession.LANGUAGES.includes(language)) {
        payload.language = language;
    }
    return { session, payload, summarizedCount };
}

/** Append the question and answer to the session, update memory, save. */
async function saveExchange(session, query, rag, summarizedCount, latencyMs) {
    if (session.messages.length === 0) {
        session.title = query.substring(0, 80);
    }
    const language = ChatSession.LANGUAGES.includes(rag.language) ? rag.language : 'en';
    session.messages.push({ role: 'user', content: query, sources: [], language });

    const usage = rag.usage || {};
    session.messages.push({
        role: 'assistant',
        content: rag.answer || 'I apologize, but I was unable to generate a response.',
        sources: rag.sources || [],
        language,
        followUps: Array.isArray(rag.follow_ups) ? rag.follow_ups.slice(0, 3) : [],
        grounded: rag.grounded,
        unsupportedCitations: rag.unsupported_citations || [],
        latencyMs,
        usage: {
            promptTokens: usage.prompt_tokens || 0,
            completionTokens: usage.completion_tokens || 0,
            totalTokens: usage.total_tokens || 0
        }
    });

    // Long-term memory: the RAG service folded the oldest `summarized_count`
    // messages we sent into a new summary — remember where the summary ends.
    const memory = rag.memory;
    if (memory && memory.summarized_count > 0) {
        session.memorySummary = memory.summary || '';
        session.summarizedCount = summarizedCount + memory.summarized_count;
    }
    await session.save();
    return session.messages.slice(-2);
}

const sessionInfo = (session) => ({ _id: session._id, title: session.title, messageCount: session.messages.length });

// POST /api/chat/sessions/:id/query — answer in one JSON response
router.post('/sessions/:id/query', async (req, res) => {
    try {
        const prepared = await prepareQuery(req, res);
        if (!prepared) return;
        const { session, payload, summarizedCount } = prepared;

        const started = Date.now();
        let rag;
        try {
            rag = (await axios.post(`${RAG_API_URL}/api/query`, payload, { timeout: 120000 })).data;
        } catch (ragError) {
            console.error('RAG API error:', ragError.message);
            return res.status(503).json({ error: 'The AI service is currently unavailable. Please try again later.' });
        }

        const messages = await saveExchange(session, payload.query, rag, summarizedCount, Date.now() - started);
        res.json({
            messages,
            language: rag.language,
            language_name: rag.language_name,
            session: sessionInfo(session)
        });
    } catch (err) {
        console.error('Query error:', err);
        res.status(500).json({ error: 'Failed to process query.' });
    }
});

// POST /api/chat/sessions/:id/query/stream — the same, streamed as Server-Sent Events:
//   meta  {sources, language, grounded}   once retrieval is done
//   token {text}                          answer text as it is generated
//   done  {messages, session}             after the exchange is saved
//   error {error}
router.post('/sessions/:id/query/stream', async (req, res) => {
    let prepared;
    try {
        prepared = await prepareQuery(req, res);
    } catch (err) {
        console.error('Query error:', err);
        return res.status(500).json({ error: 'Failed to process query.' });
    }
    if (!prepared) return;
    const { session, payload, summarizedCount } = prepared;

    const started = Date.now();
    await proxyRagStream(req, res, payload, async (result) => {
        const messages = await saveExchange(session, payload.query, result, summarizedCount, Date.now() - started);
        return { messages, language_name: result.language_name, session: sessionInfo(session) };
    });
});

// POST /api/chat/sessions/:id/messages/:messageId/feedback — thumbs up/down on an answer
router.post('/sessions/:id/messages/:messageId/feedback', async (req, res) => {
    try {
        const { rating, comment } = req.body;
        if (!['up', 'down', null].includes(rating)) {
            return res.status(400).json({ error: "Rating must be 'up', 'down' or null." });
        }
        const feedback = rating
            ? { rating, comment: typeof comment === 'string' ? comment.slice(0, 1000) : undefined, at: new Date() }
            : undefined;
        const result = await ChatSession.updateOne(
            {
                _id: req.params.id,
                userId: req.userId,
                messages: { $elemMatch: { _id: req.params.messageId, role: 'assistant' } }
            },
            feedback ? { $set: { 'messages.$.feedback': feedback } } : { $unset: { 'messages.$.feedback': '' } }
        );
        if (!result.matchedCount) {
            return res.status(404).json({ error: 'Message not found.' });
        }
        res.json({ ok: true, feedback: feedback || null });
    } catch (err) {
        console.error('Feedback error:', err);
        res.status(500).json({ error: 'Failed to save feedback.' });
    }
});

module.exports = router;
