require('dotenv').config();

// The JWT secret signs every login token. There is deliberately no fallback:
// a default secret would be public (it would sit in this repo) and let anyone
// forge a token for any user. Generate one with:
//   node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) {
    console.error('[FATAL] JWT_SECRET is missing or shorter than 32 characters. Set it in backend/server/.env');
    process.exit(1);
}

module.exports = { JWT_SECRET };
