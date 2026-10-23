// Run: npm test  (node:test, no database needed)
process.env.JWT_SECRET = process.env.JWT_SECRET || 'x'.repeat(48);

const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const { reserveOTPEmail, OTP_MAX_SENDS_PER_HOUR } = require('../utils/otp');
const { SSEParser } = require('../utils/sse');
const authMiddleware = require('../middleware/auth');

test('OTP mails: one per minute, at most five an hour', () => {
    const user = {};
    const t0 = new Date('2026-01-01T10:00:00Z');
    assert.equal(reserveOTPEmail(user, t0).ok, true);
    const again = reserveOTPEmail(user, new Date(t0.getTime() + 10 * 1000));
    assert.equal(again.ok, false);
    assert.ok(again.retryAfterS > 0 && again.retryAfterS <= 60);

    let sent = 1;
    for (let i = 1; i < 10; i++) {
        if (reserveOTPEmail(user, new Date(t0.getTime() + i * 61 * 1000)).ok) sent++;
    }
    assert.equal(sent, OTP_MAX_SENDS_PER_HOUR);
    // a new hour opens a new window
    assert.equal(reserveOTPEmail(user, new Date(t0.getTime() + 61 * 60 * 1000)).ok, true);
});

test('SSE parser handles events split across chunks and multi-line data', () => {
    const p = new SSEParser();
    assert.deepEqual(p.push('event: token\ndata: {"text":"Sec'), []);
    const events = p.push('tion 303"}\n\nevent: done\r\ndata: {"ok":true}\r\n\r\n');
    assert.deepEqual(events, [
        { event: 'token', data: { text: 'Section 303' } },
        { event: 'done', data: { ok: true } }
    ]);
});

function runAuth(token, version) {
    authMiddleware.findTokenVersion = async () => version;
    return new Promise((resolve) => {
        const req = { headers: { authorization: `Bearer ${token}` } };
        const res = {
            status(code) { this.code = code; return this; },
            json() { resolve({ status: this.code }); }
        };
        authMiddleware(req, res, () => resolve({ status: 200, userId: req.userId }));
    });
}

test('a password reset (tokenVersion bump) revokes older tokens', async () => {
    const secret = process.env.JWT_SECRET;
    const oldToken = jwt.sign({ userId: 'u1', tv: 0 }, secret);
    const newToken = jwt.sign({ userId: 'u1', tv: 1 }, secret);

    assert.equal((await runAuth(oldToken, 0)).status, 200);
    assert.equal((await runAuth(oldToken, 1)).status, 401);   // after reset
    assert.equal((await runAuth(newToken, 1)).status, 200);
    assert.equal((await runAuth(newToken, null)).status, 401); // user deleted
    // tokens issued before tokenVersion existed have no tv and count as version 0
    assert.equal((await runAuth(jwt.sign({ userId: 'u1' }, secret), 0)).status, 200);
});
