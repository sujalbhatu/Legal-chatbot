// Run: npm test  (node:test, no database needed)
const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_OTP_ATTEMPTS, generateOTP, setOTP, consumeOTP } = require('../utils/otp');

// Minimal in-memory stand-in for the Mongoose model: just the query operators
// consumeOTP uses. Each call is atomic (as findOneAndUpdate is in MongoDB), and
// awaits a tick first so parallel calls really interleave.
function fakeModel(doc) {
    const matches = (q) => Object.entries(q).every(([k, cond]) => {
        const v = doc[k];
        if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
            if ('$gt' in cond) return v > cond.$gt;
            if ('$lt' in cond) return v < cond.$lt;
            if ('$ne' in cond) return v !== cond.$ne;
        }
        return k === '_id' ? true : v === cond;
    });
    const apply = (u) => {
        Object.assign(doc, u.$set || {});
        for (const [k, n] of Object.entries(u.$inc || {})) doc[k] = (doc[k] || 0) + n;
    };
    return {
        doc,
        async findOneAndUpdate(q, u, opts = {}) {
            await new Promise(setImmediate);
            if (!matches(q)) return null;
            const before = { ...doc };
            apply(u);
            return opts.new ? { ...doc } : before;
        },
        async updateOne(q, u) {
            await new Promise(setImmediate);
            if (matches(q)) apply(u);
        }
    };
}

const userWithCode = (code = '123456') => {
    const user = { _id: 'u1' };
    setOTP(user, code);
    return fakeModel(user);
};

test('generateOTP returns 6 digits', () => {
    for (let i = 0; i < 200; i++) assert.match(generateOTP(), /^\d{6}$/);
});

test('the right code works once, then is gone', async () => {
    const User = userWithCode();
    assert.equal(await consumeOTP(User, 'u1', '123456'), null);
    assert.equal(User.doc.otp, null);
    assert.equal((await consumeOTP(User, 'u1', '123456')).status, 400);
});

test(`the code is burned after ${MAX_OTP_ATTEMPTS} wrong guesses`, async () => {
    const User = userWithCode();
    for (let i = 1; i < MAX_OTP_ATTEMPTS; i++) {
        assert.equal((await consumeOTP(User, 'u1', '000000')).status, 400);
    }
    assert.equal((await consumeOTP(User, 'u1', '000000')).status, 429);
    // even the right code no longer works
    assert.equal((await consumeOTP(User, 'u1', '123456')).status, 400);
});

test(`the right code still works on the ${MAX_OTP_ATTEMPTS}th try`, async () => {
    const User = userWithCode();
    for (let i = 1; i < MAX_OTP_ATTEMPTS; i++) await consumeOTP(User, 'u1', '000000');
    assert.equal(await consumeOTP(User, 'u1', '123456'), null);
});

test('parallel guesses cannot exceed the limit', async () => {
    const User = userWithCode('654321');
    const guesses = Array.from({ length: 50 }, (_, i) => String(100000 + i)); // all wrong
    guesses.push('654321'); // the right one arrives last
    const results = await Promise.all(guesses.map((g) => consumeOTP(User, 'u1', g)));
    const successes = results.filter((r) => r === null).length;
    assert.equal(successes, 0, 'the right code must not be accepted after the limit was hit');
    assert.equal(User.doc.otp, null);
});

test('an expired code is rejected', async () => {
    const User = userWithCode();
    User.doc.otpExpires = new Date(Date.now() - 1000);
    assert.equal((await consumeOTP(User, 'u1', '123456')).status, 400);
});

test('non-string input (e.g. a Mongo operator object) is rejected', async () => {
    const User = userWithCode();
    assert.equal((await consumeOTP(User, 'u1', { $ne: null })).status, 400);
    assert.equal(User.doc.otp, '123456');
});
