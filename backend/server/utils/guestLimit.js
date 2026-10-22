// Limits for guest (no-login) questions. Every question costs Groq tokens on a free
// tier, so guests get a small per-IP allowance plus a global daily cap. Counters live
// in memory: a restart resets them, which is acceptable for this purpose.

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

const DEFAULTS = {
    perHour: Number(process.env.GUEST_PER_HOUR) || 10,
    perDay: Number(process.env.GUEST_PER_DAY) || 25,
    globalPerDay: Number(process.env.GUEST_GLOBAL_PER_DAY) || 400,
};

class GuestLimiter {
    constructor(limits = DEFAULTS) {
        this.limits = limits;
        this.byIp = new Map();      // ip -> [timestamps of the last 24 h]
        this.global = [];           // timestamps of all guest questions in the last 24 h
    }

    _prune(list, now) {
        while (list.length && now - list[0] >= DAY_MS) list.shift();
    }

    /** Try to spend one question. Returns { ok, remainingToday, retryAfterS? }. */
    take(ip, now = Date.now()) {
        const list = this.byIp.get(ip) || [];
        this._prune(list, now);
        this._prune(this.global, now);

        const lastHour = list.filter(t => now - t < HOUR_MS);
        if (this.global.length >= this.limits.globalPerDay) {
            return { ok: false, reason: 'busy', retryAfterS: Math.ceil((DAY_MS - (now - this.global[0])) / 1000) };
        }
        if (list.length >= this.limits.perDay) {
            return { ok: false, reason: 'day', retryAfterS: Math.ceil((DAY_MS - (now - list[0])) / 1000) };
        }
        if (lastHour.length >= this.limits.perHour) {
            return { ok: false, reason: 'hour', retryAfterS: Math.ceil((HOUR_MS - (now - lastHour[0])) / 1000) };
        }
        list.push(now);
        this.global.push(now);
        this.byIp.set(ip, list);
        return { ok: true, remainingToday: this.limits.perDay - list.length };
    }

    /** Questions left today for this IP, without spending one. */
    remaining(ip, now = Date.now()) {
        const list = this.byIp.get(ip) || [];
        this._prune(list, now);
        return Math.max(0, this.limits.perDay - list.length);
    }

    /** Give a question back (the upstream service failed before answering). */
    refund(ip) {
        const list = this.byIp.get(ip);
        if (list && list.length) list.pop();
        if (this.global.length) this.global.pop();
    }
}

module.exports = { GuestLimiter, DEFAULTS };
