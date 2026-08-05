const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');

const app = express();

// Production: trust Nginx reverse proxy (correct client IP in req.ip)
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Middleware
app.use(cors());
app.use(express.json({ limit: '1mb' })); // Limit payload size

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/chat', chatRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'legal-query-server' });
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 3001;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/legal_query_system';

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        const server = app.listen(PORT, () => {
            console.log(`Server running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
        });

        // Graceful shutdown (systemd sends SIGTERM)
        const shutdown = (signal) => {
            console.log(`${signal} received. Shutting down gracefully...`);
            server.close(() => {
                mongoose.connection.close(false).then(() => {
                    console.log('MongoDB connection closed.');
                    process.exit(0);
                });
            });
            // Force exit after 10s if graceful shutdown fails
            setTimeout(() => process.exit(1), 10000);
        };
        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    })
    .catch(err => {
        console.error('MongoDB connection error:', err);
        process.exit(1);
    });
