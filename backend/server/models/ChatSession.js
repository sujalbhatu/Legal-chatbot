const mongoose = require('mongoose');

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
        act_name: String,
        section: String,
        section_title: String,
        chapter: String,
        year: String,
        text: String,
        similarity: Number
    }],
    language: {
        type: String,
        enum: ['en', 'hi', 'bn', 'sat', 'ta', 'te', 'mr', 'gu', 'kn', 'ml', 'pa', 'or', 'ur', 'as'],
        default: 'en'
    },
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
