const express = require('express');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const authMiddleware = require('../middleware/auth');

const { sendOTPEmail } = require('../utils/emailService');
const { generateOTP, setOTP, consumeOTP, reserveOTPEmail } = require('../utils/otp');

const router = express.Router();
const { JWT_SECRET } = require('../config');

// The token carries the user's tokenVersion; a password reset bumps it, which
// invalidates every token issued before (see middleware/auth.js)
function generateToken(user) {
    return jwt.sign({ userId: user._id, tv: user.tokenVersion || 0 }, JWT_SECRET, { expiresIn: '7d' });
}

// Same answer whether or not the address is registered, so signup can't be used to
// find out who has an account
const SIGNUP_SENT = { message: 'If this email can be registered, a verification code has been sent to it.' };

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ error: 'Name, email, and password are required.' });
        }

        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        if (typeof name !== 'string' || typeof email !== 'string' || typeof password !== 'string') {
            return res.status(400).json({ error: 'Invalid signup details.' });
        }

        let user = await User.findOne({ email: email.toLowerCase() });

        if (user && user.isVerified) {
            // Don't reveal that the account exists; the owner can log in or reset the password
            return res.status(201).json({ ...SIGNUP_SENT, email: user.email });
        }
        if (user) {
            // Unverified account: take the new details and send a fresh code
            user.name = name;
            user.password = password;
        } else {
            user = new User({
                name,
                email: email.toLowerCase(),
                password,
                isVerified: false
            });
        }
        const slot = reserveOTPEmail(user);
        if (!slot.ok) {
            // A recent code is still valid; don't send another one yet
            await user.save();
            return res.status(201).json({ ...SIGNUP_SENT, email: user.email, retryAfterS: slot.retryAfterS });
        }
        const otp = generateOTP();
        setOTP(user, otp);
        await user.save();

        const emailSent = await sendOTPEmail(user.email, otp, 'verify');
        if (!emailSent) {
            return res.status(500).json({ error: 'Failed to send verification email. Please try again later.' });
        }

        res.status(201).json({ ...SIGNUP_SENT, email: user.email });
    } catch (err) {
        console.error('Signup error:', err);
        res.status(500).json({ error: 'Server error during signup.' });
    }
});

// POST /api/auth/verify-email
router.post('/verify-email', async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ error: 'Email and OTP are required.' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }

        if (user.isVerified) {
            return res.status(400).json({ error: 'Account is already verified.' });
        }

        const otpError = await consumeOTP(User, user._id, otp);
        if (otpError) {
            return res.status(otpError.status).json({ error: otpError.error });
        }

        // Mark user as verified
        user.isVerified = true;
        user.otp = null;
        user.otpExpires = null;
        await user.save();

        const token = generateToken(user);

        res.json({
            message: 'Account verified successfully!',
            token,
            user: user.toJSON()
        });
    } catch (err) {
        console.error('Verification error:', err);
        res.status(500).json({ error: 'Server error during verification.' });
    }
});

// POST /api/auth/forgot-password
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;

        if (!email) {
            return res.status(400).json({ error: 'Email is required.' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            // Return success even if user not found to prevent email enumeration
            return res.json({ message: 'If an account with that email exists, a reset code has been sent.' });
        }

        if (reserveOTPEmail(user).ok) {
            const otp = generateOTP();
            setOTP(user, otp);
            await user.save();
            await sendOTPEmail(user.email, otp, 'reset');
        }

        res.json({ message: 'If an account with that email exists, a reset code has been sent.' });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ error: 'Server error.' });
    }
});

// POST /api/auth/reset-password
router.post('/reset-password', async (req, res) => {
    try {
        const { email, otp, newPassword } = req.body;

        if (!email || !otp || !newPassword) {
            return res.status(400).json({ error: 'Email, OTP, and new password are required.' });
        }

        if (newPassword.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters.' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(400).json({ error: 'Invalid or expired OTP.' });
        }

        const otpError = await consumeOTP(User, user._id, otp);
        if (otpError) {
            return res.status(otpError.status).json({ error: otpError.error });
        }

        user.password = newPassword;
        user.otp = null;
        user.otpExpires = null;
        // Log out every existing session: whoever knew the old password may hold a token
        user.tokenVersion = (user.tokenVersion || 0) + 1;
        await user.save();

        res.json({ message: 'Password has been successfully reset. You can now log in.' });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ error: 'Server error during password reset.' });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required.' });
        }

        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        // Return error if unverified
        if (!user.isVerified) {
            // Resend a code, but not on every login attempt (inbox flooding)
            const slot = reserveOTPEmail(user);
            if (slot.ok) {
                const otp = generateOTP();
                setOTP(user, otp);
                await user.save();
                await sendOTPEmail(user.email, otp, 'verify');
            }

            return res.status(403).json({
                error: 'Account not verified.',
                unverified: true,
                email: user.email,
                message: slot.ok
                    ? 'A new verification code has been sent to your email.'
                    : 'Use the verification code we already sent to your email.'
            });
        }

        const token = generateToken(user);

        res.json({
            message: 'Login successful!',
            token,
            user: user.toJSON()
        });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: 'Server error during login.' });
    }
});

// GET /api/auth/profile (protected)
router.get('/profile', authMiddleware, async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }
        res.json({ user: user.toJSON() });
    } catch (err) {
        console.error('Profile error:', err);
        res.status(500).json({ error: 'Server error.' });
    }
});
// PUT /api/auth/profile (protected)
router.put('/profile', authMiddleware, async (req, res) => {
    try {
        const { name, password } = req.body;
        
        // Find user
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({ error: 'User not found.' });
        }
        
        // Update fields
        if (name) {
            if (name.length < 2) {
                return res.status(400).json({ error: 'Name must be at least 2 characters.' });
            }
            user.name = name;
        }
        
        let token;
        if (password) {
            if (password.length < 6) {
                return res.status(400).json({ error: 'Password must be at least 6 characters.' });
            }
            user.password = password;
            // Other devices are logged out; this one gets a fresh token
            user.tokenVersion = (user.tokenVersion || 0) + 1;
            token = generateToken(user);
        }

        await user.save();

        res.json({
            message: 'Profile updated successfully!',
            user: user.toJSON(),
            ...(token ? { token } : {})
        });
    } catch (err) {
        console.error('Profile update error:', err);
        res.status(500).json({ error: 'Server error during profile update.' });
    }
});

module.exports = router;
