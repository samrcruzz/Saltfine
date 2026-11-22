import { Router, Request, Response } from 'express'
import { verifyPassword } from '../auth/passwords'
import { clearedSessionCookie, createSessionToken, sessionCookie } from '../auth/session'
import { findUser } from '../auth/users'

const router = Router()

// Simple brute-force brake: 5 wrong passwords for the same name from the same address -> 1 minute pause.
const MAX_FAILURES = 5
const LOCK_MS = 60_000
const failures = new Map<string, { count: number; lockedUntil: number }>()

// Compared against when the username does not exist, so both cases take the same time.
const DUMMY_HASH = 'scrypt$c2FsdGZpbmUtZHVtbXk$' + 'A'.repeat(86)

// POST /api/auth/login { username, password } -> { username, role } + session cookie
router.post('/login', async (req: Request, res: Response) => {
  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : ''
  const password = typeof req.body?.password === 'string' ? req.body.password : ''
  if (!username || !password) {
    res.status(400).json({ error: 'Enter your username and password' })
    return
  }

  const key = `${req.ip}|${username.toLowerCase()}`
  const entry = failures.get(key)
  const now = Date.now()
  if (entry && entry.lockedUntil > now) {
    const seconds = Math.ceil((entry.lockedUntil - now) / 1000)
    res.status(429).json({ error: `Too many wrong passwords. Try again in ${seconds} s.` })
    return
  }

  const user = findUser(username)
  const ok = await verifyPassword(password, user?.passwordHash ?? DUMMY_HASH)
  if (!user || !ok) {
    const lockExpired = entry !== undefined && entry.lockedUntil !== 0 && entry.lockedUntil <= now
    const count = (entry && !lockExpired ? entry.count : 0) + 1
    if (failures.size > 1000) failures.clear() // keep memory bounded
    failures.set(key, { count, lockedUntil: count >= MAX_FAILURES ? now + LOCK_MS : 0 })
    res.status(401).json({ error: 'Wrong username or password' })
    return
  }

  failures.delete(key)
  res.setHeader('Set-Cookie', sessionCookie(createSessionToken(user)))
  res.json({ username: user.username, role: user.role })
})

// POST /api/auth/logout
router.post('/logout', (_req: Request, res: Response) => {
  res.setHeader('Set-Cookie', clearedSessionCookie())
  res.json({ ok: true })
})

// GET /api/auth/me -> { username, role }, or null when signed out (200 either way: not an error)
router.get('/me', (req: Request, res: Response) => {
  res.json(req.user ?? null)
})

export default router
