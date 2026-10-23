const mongoose = require('mongoose');

const LANGUAGES = ['en', 'hi', 'bn', 'sat', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'ur', 'as', 'hinglish'];

const messageSchema = new mongoose.Schema({
    role: {
        type: String,
        enum: ['user', 'assistant'],
        required: true
    },
    content: {
        type: String,
        required: true
    },
    sources: [{
        n: Number,              // the [n] the answer uses to cite this source
        act_name: String,
        section: String,
        section_title: String,
        chapter: String,
        year: String,
        source_file: String,
        text: String,
        similarity: Number,     // reranker relevance 0-1 (null when not reranked)
        cited: Boolean
    }],
    language: {
        type: String,
        enum: LANGUAGES,
        default: 'en'
    },
    followUps: [String],
    // false when no indexed Act matched well and the assistant said so
    grounded: Boolean,
    // section numbers the answer mentions that were not in the retrieved sources
    unsupportedCitations: [String],
    // thumbs up/down from the user; collected to grow the evaluation set
    feedback: {
        rating: { type: String, enum: ['up', 'down'] },
        comment: { type: String, maxlength: 1000 },
        at: Date
    },
    latencyMs: Number,
    timestamp: {
        type: Date,
        default: Date.now
    },
    // LLM tokens spent producing this answer (all calls: translate, act detection, memory, answer)
    usage: {
        promptTokens: Number,
        completionTokens: Number,
        totalTokens: Number
    }
});

const chatSessionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    title: {
        type: String,
        default: 'New Legal Query',
        trim: true
    },
    messages: [messageSchema],
    // Long-term memory: a rolling summary of messages[0 .. summarizedCount-1].
    // Only messages after summarizedCount are sent to the RAG service verbatim.
    memorySummary: {
        type: String,
        default: ''
    },
    summarizedCount: {
        type: Number,
        default: 0
    },
    isSolved: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('ChatSession', chatSessionSchema);
module.exports.LANGUAGES = LANGUAGES;
