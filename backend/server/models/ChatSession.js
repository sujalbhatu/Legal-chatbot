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
        enum: ['en', 'hi', 'bn', 'sat'],
        default: 'en'
    },
    timestamp: {
        type: Date,
        default: Date.now
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
    isSolved: {
        type: Boolean,
        default: false
    }
}, { timestamps: true });

module.exports = mongoose.model('ChatSession', chatSessionSchema);
