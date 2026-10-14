import { randomBytes } from 'node:crypto';
export function dailyCode(timezone, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', day: 'numeric', hour: 'numeric', hour12: true }).formatToParts(date);
  const get = type => parts.find(p => p.type === type).value;
  return get('weekday') + get('day') + get('dayPeriod').toUpperCase();
}
export const lifetime = words => Math.ceil(words / 5) * 2000;
export class Vault {
  constructor(now = Date.now) { this.now = now; this.messages = new Map(); this.sessions = new Map(); this.attempts = new Map(); }
  cleanup() {
    const now = this.now();
    for (const [id, m] of this.messages) if (m.expires <= now) { m.key.fill(0); this.messages.delete(id); }
    for (const [id, s] of this.sessions) if (s.expires <= now) this.sessions.delete(id);
    for (const [ip, a] of this.attempts) if (a.until <= now) this.attempts.delete(ip);
  }
  create(key, words) {
    const id = randomBytes(24).toString('base64url');
    this.messages.set(id, { key: Buffer.from(key), duration: lifetime(words), expires: this.now() + 86400000, opened: false });
    return id;
  }
  session(ip) { const token = randomBytes(32).toString('base64url'); this.sessions.set(token, { ip, expires: this.now() + 120000 }); return token; }
  authorize(token, ip) { this.cleanup(); const s = this.sessions.get(token); if (!s || s.ip !== ip) return false; s.expires = this.now() + 120000; return true; }
  open(id) {
    this.cleanup(); const m = this.messages.get(id); if (!m || m.opened) return null;
    m.opened = true; const key = m.key.toString('base64'); m.key.fill(0);
    const expires = this.now() + m.duration; this.messages.delete(id);
    return { key, duration: m.duration, expires };
  }
  erase(id) { const m = this.messages.get(id); if (m) { m.key.fill(0); this.messages.delete(id); } }
  attempt(ip) { this.cleanup(); const a = this.attempts.get(ip) || { count: 0, until: this.now() + 600000 }; if (a.count >= 10) return false; a.count++; this.attempts.set(ip, a); return true; }
}
