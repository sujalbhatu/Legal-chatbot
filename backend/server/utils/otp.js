const crypto = require('crypto');

// A 6-digit code has only 900,000 values, so guesses must be limited.
const MAX_OTP_ATTEMPTS = 5;
const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes

// Random 6-digit code from the crypto RNG (not Math.random)
function generateOTP() {
    return crypto.randomInt(100000, 1000000).toString();
}

// Put a fresh code on the user document (caller saves) and reset the guess counter
function setOTP(user, otp) {
    user.otp = otp;
    user.otpExpires = new Date(Date.now() + OTP_TTL_MS);
    user.otpAttempts = 0;
}

const burn = (UserModel, userId, otp) =>
    UserModel.updateOne({ _id: userId, otp }, { $set: { otp: null, otpExpires: null, otpAttempts: 0 } });

/**
 * Checks and consumes a submitted code for userId.
 *
 * Every guess, right or wrong, first takes one attempt slot with an atomic $inc,
 * and only guesses that got slot 1..MAX_OTP_ATTEMPTS are compared at all. So a
 * burst of parallel guesses can't test more than MAX_OTP_ATTEMPTS codes: the
 * rest are refused without being compared. A right code is cleared by a
 * conditional update, so it works exactly once; the guess that uses the last
 * slot without matching burns the code.
 * Returns null on success, otherwise { status, error } for the response.
 */
async function consumeOTP(UserModel, userId, submitted) {
    const invalid = { status: 400, error: 'Invalid or expired OTP.' };
    const locked = { status: 429, error: 'Too many incorrect codes. Please request a new one.' };
    if (typeof submitted !== 'string' && typeof submitted !== 'number') return invalid;

    const slot = await UserModel.findOneAndUpdate(
        { _id: userId, otp: { $ne: null }, otpExpires: { $gt: new Date() } },
        { $inc: { otpAttempts: 1 } },
        { new: true }
    );
    if (!slot) return invalid; // no live code
    if (slot.otpAttempts > MAX_OTP_ATTEMPTS) {
        await burn(UserModel, userId, slot.otp);
        return locked;
    }

    if (slot.otp === String(submitted)) {
        const consumed = await UserModel.findOneAndUpdate(
            { _id: userId, otp: slot.otp },
            { $set: { otp: null, otpExpires: null, otpAttempts: 0 } }
        );
        if (consumed) return null;
        return invalid; // a parallel request consumed or burned it first
    }

    if (slot.otpAttempts >= MAX_OTP_ATTEMPTS) {
        await burn(UserModel, userId, slot.otp);
        return locked;
    }
    return invalid;
}

module.exports = { MAX_OTP_ATTEMPTS, generateOTP, setOTP, consumeOTP };
