// Sign-in against the Express backend. The session lives in an HttpOnly cookie set by the backend,
// so every request to the API must be sent with credentials: 'include'.

export type Role = 'viewer' | 'dev'

export interface SessionUser {
  username: string
  role: Role
}

import { API_BASE_URL, DEMO_MODE } from '../config'

const BASE_URL = API_BASE_URL

// Demo mode (no backend): nothing to sign in to, everything is visible.
export const AUTH_ENABLED = !DEMO_MODE
export const MOCK_USER: SessionUser = { username: 'demo', role: 'dev' }

// Fired by any API call that gets a 401, so the app can return to the sign-in page.
const UNAUTHORIZED_EVENT = 'saltfine:unauthorized'

export function notifyUnauthorized(): void {
  window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
}

export function onUnauthorized(handler: () => void): () => void {
  window.addEventListener(UNAUTHORIZED_EVENT, handler)
  return () => window.removeEventListener(UNAUTHORIZED_EVENT, handler)
}

async function errorText(response: Response): Promise<string> {
  try {
    const body = await response.json()
    if (body?.error) return String(body.error)
  } catch {
    /* not JSON */
  }
  return `Request failed (${response.status})`
}

/** The signed-in user, or null when signed out. */
export async function getSession(): Promise<SessionUser | null> {
  const response = await fetch(`${BASE_URL}/api/auth/me`, { credentials: 'include' })
  if (!response.ok) throw new Error(await errorText(response))
  return response.json()
}

export async function signIn(username: string, password: string): Promise<SessionUser> {
  const response = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ username, password }),
  })
  if (!response.ok) throw new Error(await errorText(response))
  return response.json()
}

export async function signOut(): Promise<void> {
  await fetch(`${BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' })
}

export const ROLE_LABEL: Record<Role, string> = { viewer: 'Viewer', dev: 'Dev' }
