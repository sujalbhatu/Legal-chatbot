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

// OTP e-mail throttle: at most one mail a minute and five an hour per address
const OTP_RESEND_GAP_MS = 60 * 1000;
const OTP_MAX_SENDS_PER_HOUR = 5;
const HOUR_MS = 60 * 60 * 1000;

/**
 * Whether another OTP e-mail may go to this user now. If yes, records the send on
 * the document (caller saves). Returns { ok: true } or { ok: false, retryAfterS }.
 */
function reserveOTPEmail(user, now = new Date()) {
    if (user.otpSentAt && now - user.otpSentAt < OTP_RESEND_GAP_MS) {
        return { ok: false, retryAfterS: Math.ceil((OTP_RESEND_GAP_MS - (now - user.otpSentAt)) / 1000) };
    }
    if (!user.otpSendWindowStart || now - user.otpSendWindowStart >= HOUR_MS) {
        user.otpSendWindowStart = now;
        user.otpSendCount = 0;
    }
    if (user.otpSendCount >= OTP_MAX_SENDS_PER_HOUR) {
        return { ok: false, retryAfterS: Math.ceil((HOUR_MS - (now - user.otpSendWindowStart)) / 1000) };
    }
    user.otpSendCount += 1;
    user.otpSentAt = now;
    return { ok: true };
}

module.exports = {
    MAX_OTP_ATTEMPTS, OTP_MAX_SENDS_PER_HOUR, generateOTP, setOTP, consumeOTP, reserveOTPEmail
};
