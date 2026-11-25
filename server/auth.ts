import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type Database from 'better-sqlite3';

export const SESSION_COOKIE_NAME = 'gf_session';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7; // 7 days

// Scrypt parameters (N=16384, r=8, p=1, keylen=64)
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return `scrypt$${salt}$${derived}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const [, salt, hashHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  const expected = Buffer.from(hashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export function hashSessionToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSession(db: Database.Database, adminId: number): { token: string; expiresAt: string } {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);
  const now = new Date();
  const expires = new Date(now.getTime() + SESSION_TTL_MS);

  db.prepare(
    'INSERT INTO sessions (admin_id, session_token_hash, created_at, expires_at) VALUES (?, ?, ?, ?)',
  ).run(adminId, tokenHash, now.toISOString(), expires.toISOString());

  // Clean up expired sessions periodically
  db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now.toISOString());

  return { token, expiresAt: expires.toISOString() };
}

function isHttpsRequest(req: Request): boolean {
  const forwardedProto = String(req.headers['x-forwarded-proto'] ?? '')
    .split(',')[0]
    .trim()
    .toLowerCase();
  return Boolean(req.secure || forwardedProto === 'https');
}

export function setSessionCookie(req: Request, res: Response, token: string): void {
  const isHttps = isHttpsRequest(req);

  const cookieParts = [
    `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`,
  ];

  if (isHttps) {
    cookieParts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    cookieParts.push('SameSite=Lax');
  }

  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

export function clearSessionCookie(req: Request, res: Response): void {
  const isHttps = isHttpsRequest(req);

  const cookieParts = [
    `${SESSION_COOKIE_NAME}=`,
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
  ];

  if (isHttps) {
    cookieParts.push('Secure', 'SameSite=None', 'Partitioned');
  } else {
    cookieParts.push('SameSite=Lax');
  }

  res.setHeader('Set-Cookie', cookieParts.join('; '));
}

// Simple in-memory sliding-window login rate limiter
const loginAttempts = new Map<string, number[]>();
const RATE_WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 12;

export function checkLoginRateLimit(ip: string): boolean {
  const now = Date.now();
  const list = (loginAttempts.get(ip) ?? []).filter((ts) => now - ts < RATE_WINDOW_MS);
  if (list.length >= MAX_ATTEMPTS) {
    loginAttempts.set(ip, list);
    return false;
  }
  return true;
}

export function recordFailedLogin(ip: string): void {
  const now = Date.now();
  const list = (loginAttempts.get(ip) ?? []).filter((ts) => now - ts < RATE_WINDOW_MS);
  list.push(now);
  loginAttempts.set(ip, list);
}

export function clearFailedLogins(ip: string): void {
  loginAttempts.delete(ip);
}

// Sliding-window rate limiter for public unauthenticated visitor contributions
const contributionAttempts = new Map<string, number[]>();
const CONTRIBUTION_WINDOW_MS = 10 * 60 * 1000;
const MAX_CONTRIBUTIONS_PER_WINDOW = 15;

export function checkContributionRateLimit(ip: string): boolean {
  const now = Date.now();
  const list = (contributionAttempts.get(ip) ?? []).filter(
    (ts) => now - ts < CONTRIBUTION_WINDOW_MS,
  );
  if (list.length >= MAX_CONTRIBUTIONS_PER_WINDOW) {
    contributionAttempts.set(ip, list);
    return false;
  }
  list.push(now);
  contributionAttempts.set(ip, list);
  return true;
}

export interface AuthedRequest extends Request {
  adminUser?: {
    id: number;
    username: string;
    must_change_credentials: boolean;
  };
}

export function extractSessionToken(req: Request): string | null {
  const cookieToken = req.cookies?.[SESSION_COOKIE_NAME];
  if (typeof cookieToken === 'string' && cookieToken.trim()) {
    return cookieToken.trim();
  }
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice('Bearer '.length).trim();
    if (bearer) return bearer;
  }
  return null;
}

/**
 * Verifies CSRF origin/custom-header protection on cookie-authenticated mutations.
 */
export function verifyCsrf(req: Request): boolean {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return true;
  }
  const requestedWith = req.headers['x-requested-with'];
  if (requestedWith === 'XMLHttpRequest' || requestedWith === 'GrowingForest') {
    return true;
  }
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    return true;
  }
  const origin = req.headers.origin;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  if (origin && host) {
    try {
      const originHost = new URL(origin).host;
      if (originHost === host) return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function createRequireAdmin(db: Database.Database) {
  return function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
    if (!verifyCsrf(req)) {
      res.status(403).json({ error: 'CSRF check failed' });
      return;
    }

    const rawToken = extractSessionToken(req);
    if (!rawToken) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const tokenHash = hashSessionToken(rawToken);
    const nowIso = new Date().toISOString();

    const row = db
      .prepare(
        `SELECT a.id, a.username, a.must_change_credentials
         FROM sessions s
         JOIN admin a ON a.id = s.admin_id
         WHERE s.session_token_hash = ? AND s.expires_at > ?`,
      )
      .get(tokenHash, nowIso) as
      | { id: number; username: string; must_change_credentials: number }
      | undefined;

    if (!row) {
      res.status(401).json({ error: 'Session expired or invalid' });
      return;
    }

    req.adminUser = {
      id: row.id,
      username: row.username,
      must_change_credentials: Boolean(row.must_change_credentials),
    };
    next();
  };
}
