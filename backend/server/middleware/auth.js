const jwt = require('jsonwebtoken');

const { JWT_SECRET } = require('../config');
const User = require('../models/User');

// Verifies the JWT and that it was issued for the user's current tokenVersion:
// after a password reset/change, tokens issued earlier stop working.
function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    const token = authHeader.split(' ')[1];

    let decoded;
    try {
        decoded = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token.' });
    }

    authMiddleware.findTokenVersion(decoded.userId)
        .then((version) => {
            // Tokens from before this check existed carry no tv; they match version 0
            if (version === null || (decoded.tv || 0) !== version) {
                return res.status(401).json({ error: 'Invalid or expired token.' });
            }
            req.userId = decoded.userId;
            next();
        })
        .catch(() => res.status(500).json({ error: 'Server error.' }));
}

// A property so tests can stub the database lookup
authMiddleware.findTokenVersion = async (userId) => {
    const user = await User.findById(userId).select('tokenVersion').lean();
    return user ? (user.tokenVersion || 0) : null;
};

module.exports = authMiddleware;
