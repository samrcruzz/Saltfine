// Signed session cookie: <payload base64url>.<HMAC-SHA256 base64url>
// The payload holds the username, expiry and a fingerprint of the password hash, so changing a
// password signs that user out everywhere. The role is read from users.json on every request,
// so a role change applies immediately.

import { createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto'
import type { StoredUser } from './users'

export const SESSION_COOKIE = 'saltfine_session'
export const SESSION_TTL_MS = 12 * 60 * 60 * 1000

interface SessionPayload {
  u: string
  exp: number
  v: string
}

let cachedSecret: Buffer | null = null

function secret(): Buffer {
  if (cachedSecret) return cachedSecret
  const configured = process.env.AUTH_SECRET
  if (configured && configured.length >= 32) {
    cachedSecret = Buffer.from(configured)
  } else {
    console.warn('⚠️  AUTH_SECRET is not set (or shorter than 32 characters): using a random one. Everyone is signed out when the server restarts.')
    cachedSecret = randomBytes(32)
  }
  return cachedSecret
}

function sign(data: string): string {
  return createHmac('sha256', secret()).update(data).digest('base64url')
}

/** Short fingerprint of the password hash: changes when the password changes. */
export function passwordVersion(user: StoredUser): string {
  return createHash('sha256').update(user.passwordHash).digest('base64url').slice(0, 12)
}

export function createSessionToken(user: StoredUser, now = Date.now()): string {
  const payload: SessionPayload = { u: user.username, exp: now + SESSION_TTL_MS, v: passwordVersion(user) }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${body}.${sign(body)}`
}

/** Returns the payload of a valid, unexpired token, else null. */
export function readSessionToken(token: string, now = Date.now()): SessionPayload | null {
  const [body, signature] = token.split('.')
  if (!body || !signature) return null
  const expected = Buffer.from(sign(body))
  const given = Buffer.from(signature)
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
    if (typeof payload.u !== 'string' || typeof payload.exp !== 'number' || payload.exp <= now) return null
    return payload
  } catch {
    return null
  }
}

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of (header ?? '').split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    const key = part.slice(0, i).trim()
    if (key) out[key] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

// SameSite=Lax: sent to the API from the dashboard on localhost (same site, different port),
// not sent on cross-site form posts. No "Secure" flag because the app runs on plain http locally.
export function sessionCookie(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_MS / 1000}`
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`
}
