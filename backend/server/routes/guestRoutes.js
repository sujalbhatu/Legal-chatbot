// Guest mode: ask questions without an account. Nothing is stored on the server; the
// browser keeps the conversation and sends the recent turns with each question.
const express = require('express');
const ChatSession = require('../models/ChatSession');
const { GuestLimiter } = require('../utils/guestLimit');
const { proxyRagStream } = require('../utils/ragStream');

const router = express.Router();
const limiter = new GuestLimiter();

const MAX_QUERY_CHARS = 2000;
const MAX_HISTORY = 8;          // recent messages a guest may send back as context
const MAX_HISTORY_CHARS = 4000; // per message

function cleanHistory(history) {
    if (!Array.isArray(history)) return [];
    return history
        .filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .slice(-MAX_HISTORY)
        .map(m => ({
            role: m.role,
            content: m.content.slice(0, MAX_HISTORY_CHARS),
            ...(typeof m.language === 'string' ? { language: m.language } : {})
        }));
}

// GET /api/chat/guest/status — how many guest questions are left today
router.get('/status', (req, res) => {
    res.json({ remainingToday: limiter.remaining(req.ip), perDay: limiter.limits.perDay });
});

// POST /api/chat/guest/query/stream — same event stream as a signed-in chat, not saved
router.post('/query/stream', async (req, res) => {
    const { query, language, history } = req.body || {};
    if (typeof query !== 'string' || !query.trim()) {
        return res.status(400).json({ error: 'Query cannot be empty.' });
    }
    if (query.length > MAX_QUERY_CHARS) {
        return res.status(400).json({ error: `Query is too long (max ${MAX_QUERY_CHARS} characters).` });
    }
    const slot = limiter.take(req.ip);
    if (!slot.ok) {
        res.set('Retry-After', String(slot.retryAfterS));
        const error = slot.reason === 'busy'
            ? 'Guest mode is busy right now. Create a free account to keep asking.'
            : `You've used the guest questions for ${slot.reason === 'hour' ? 'this hour' : 'today'}. Create a free account to keep asking and save your chats.`;
        return res.status(429).json({ error, retryAfterS: slot.retryAfterS });
    }

    const payload = { query: query.trim(), chat_history: cleanHistory(history), memory_summary: '' };
    if (typeof language === 'string' && ChatSession.LANGUAGES.includes(language)) {
        payload.language = language;
    }
    const answered = await proxyRagStream(req, res, payload, (result) => ({
        message: {
            role: 'assistant',
            content: result.answer,
            sources: result.sources || [],
            followUps: result.follow_ups || [],
            grounded: result.grounded,
            unsupportedCitations: result.unsupported_citations || [],
            language: result.language
        },
        language_name: result.language_name,
        remainingToday: slot.remainingToday
    }));
    if (!answered) limiter.refund(req.ip);
});

module.exports = router;
module.exports.limiter = limiter;
module.exports.cleanHistory = cleanHistory;
