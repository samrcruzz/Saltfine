import type { NextFunction, Request, Response } from 'express'
import { parseCookies, passwordVersion, readSessionToken, SESSION_COOKIE } from './session'
import { findUser, type Role } from './users'

export interface SessionUser {
  username: string
  role: Role
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: SessionUser
  }
}

/** Attaches req.user when the request carries a valid session cookie. Never rejects. */
export function authenticate(req: Request, _res: Response, next: NextFunction): void {
  const token = parseCookies(req.headers.cookie)[SESSION_COOKIE]
  const payload = token ? readSessionToken(token) : null
  if (payload) {
    const user = findUser(payload.u)
    if (user && passwordVersion(user) === payload.v) req.user = { username: user.username, role: user.role }
  }
  next()
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Please sign in' })
    return
  }
  next()
}

export function requireDev(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Please sign in' })
    return
  }
  if (req.user.role !== 'dev') {
    res.status(403).json({ error: 'This needs a dev account' })
    return
  }
  next()
}

/** Any signed-in user may read (GET/HEAD); changing data needs a dev account. */
export function readAnyWriteDev(req: Request, res: Response, next: NextFunction): void {
  if (req.method === 'GET' || req.method === 'HEAD') return requireAuth(req, res, next)
  requireDev(req, res, next)
}
