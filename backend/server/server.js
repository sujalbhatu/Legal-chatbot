const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/authRoutes');
const chatRoutes = require('./routes/chatRoutes');
const guestRoutes = require('./routes/guestRoutes');

const app = express();

// Production: trust Nginx reverse proxy (correct client IP in req.ip)
if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
}

// Middleware
// Only the site itself may call the API from a browser (comma-separated list;
// the Vite dev server is allowed outside production)
const allowedOrigins = (process.env.CORS_ORIGINS || 'https://openforge.online,https://www.openforge.online')
    .split(',').map(s => s.trim()).filter(Boolean);
if (process.env.NODE_ENV !== 'production') {
    allowedOrigins.push('http://localhost:5173', 'http://127.0.0.1:5173');
}
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '1mb' })); // Limit payload size

// Routes
app.use('/api/auth', authRoutes);
// Guest mode (no login) is mounted before the signed-in chat routes, which require auth
app.use('/api/chat/guest', guestRoutes);
app.use('/api/chat', chatRoutes);

// Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', service: 'legal-query-server' });
});

// Connect to MongoDB and start server
const PORT = process.env.PORT || 3001;
// Nginx is the public entry point; Node only needs to accept local connections
const HOST = process.env.HOST || '127.0.0.1';
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/legal_query_system';

mongoose.connect(MONGODB_URI)
    .then(() => {
        console.log('Connected to MongoDB');
        const server = app.listen(PORT, HOST, () => {
            console.log(`Server running on ${HOST}:${PORT} (${process.env.NODE_ENV || 'development'})`);
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
