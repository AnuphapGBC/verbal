import { randomBytes, scrypt as scryptCallback, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { z } from 'zod';
import { query } from './db.js';

const scrypt = promisify(scryptCallback);
const SESSION_DAYS = 7;
export const cookieName = 'verbal_session';
export const cookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', path: '/', maxAge: SESSION_DAYS * 86400000 };
export const hash = value => createHash('sha256').update(value).digest('hex');
export const lockSchedule = client => client.query('SELECT pg_advisory_xact_lock(7421104)');
export const publicUser = row => ({ id: row.id, name: row.name, email: row.email, goal: row.goal, role: row.role });
export class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export const fail = (status, message) => { throw new HttpError(status, message); };
export function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) fail(422, result.error.issues.map(issue => `${issue.path.join('.') || 'Input'}: ${issue.message}`).join('; '));
  return result.data;
}
export const text = (min, max) => z.string().trim().min(min).max(max);
export const uuid = z.string().uuid();
export const integerId = z.coerce.number().int().positive();
export const passwordSchema = z.string().min(10, 'Use at least 10 characters').max(128);
export const emailSchema = z.email().max(254).transform(value => value.toLowerCase());
export const languages = ['English', 'Spanish', 'French', 'German', 'Italian', 'Japanese'];
export const tutorSchema = z.object({
  name: text(2, 80), country: text(2, 80), flag: text(1, 12).default('🌍'),
  language: z.enum(languages), native: text(3, 200), price: z.coerce.number().int().min(5).max(500),
  tag: text(5, 120), bio: text(40, 3000),
});
export const isoDate = z.iso.datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)), 'Use a valid timestamp');

export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${salt}$${key.toString('hex')}`;
}
// The dummy hash keeps unknown-account logins on the same expensive path.
const dummyHash = `scrypt$${'0'.repeat(32)}$${'0'.repeat(128)}`;
export async function verifyPassword(password, stored = dummyHash) {
  const [scheme, salt, key] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || key?.length !== 128) return false;
  const candidate = await scrypt(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 });
  return timingSafeEqual(candidate, Buffer.from(key, 'hex'));
}
export async function setSession(res, userId) {
  const token = randomBytes(32).toString('hex');
  await query('INSERT INTO verbal.sessions(token_hash,user_id,expires_at) VALUES($1,$2,NOW()+INTERVAL \'7 days\')', [hash(token), userId]);
  res.cookie(cookieName, token, cookieOptions);
}
function readCookie(req) {
  const entry = (req.headers.cookie || '').split(';').map(value => value.trim()).find(value => value.startsWith(`${cookieName}=`));
  const value = entry?.slice(cookieName.length + 1);
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}
export async function session(req, _res, next) {
  const token = readCookie(req);
  req.user = null;
  if (token) {
    req.sessionHash = hash(token);
    const result = await query(`SELECT u.id,u.name,u.email,u.goal,u.role
      FROM verbal.sessions s JOIN verbal.users u ON u.id=s.user_id
      WHERE s.token_hash=$1 AND s.expires_at>NOW()`, [req.sessionHash]);
    req.user = result.rows[0] || null;
  }
  next();
}
export function authenticated(req, _res, next) {
  if (!req.user) fail(401, 'Please log in to continue.');
  next();
}
// Shared Postgres counters enforce limits across server processes.
export function rateLimit(prefix, limit, keyFn = req => req.ip) {
  return async (req, res, next) => {
    const key = hash(`${prefix}:${keyFn(req)}`);
    const { rows } = await query(`INSERT INTO verbal.login_attempts(key_hash,count,reset_at)
      VALUES($1,1,NOW()+INTERVAL '15 minutes') ON CONFLICT(key_hash) DO UPDATE
      SET count=CASE WHEN verbal.login_attempts.reset_at<=NOW() THEN 1 ELSE verbal.login_attempts.count+1 END,
      reset_at=CASE WHEN verbal.login_attempts.reset_at<=NOW() THEN NOW()+INTERVAL '15 minutes' ELSE verbal.login_attempts.reset_at END
      RETURNING count,reset_at`, [key]);
    if (rows[0].count > limit) {
      res.setHeader('Retry-After', Math.max(1, Math.ceil((new Date(rows[0].reset_at).getTime() - Date.now()) / 1000)));
      fail(429, 'Too many attempts. Please try again in 15 minutes.');
    }
    next();
  };
}
