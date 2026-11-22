import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import {
  AUTH_ENABLED,
  getSession,
  MOCK_USER,
  onUnauthorized,
  signIn as apiSignIn,
  signOut as apiSignOut,
  type Role,
  type SessionUser,
} from '../services/auth'

type AuthStatus = 'loading' | 'signed-out' | 'signed-in' | 'unreachable'

interface AuthValue {
  status: AuthStatus
  user: SessionUser | null
  /** true when the signed-in user has this role (dev also counts as viewer) */
  can: (role: Role) => boolean
  signIn: (username: string, password: string) => Promise<void>
  signOut: () => Promise<void>
  retry: () => void
}

const AuthContext = createContext<AuthValue | null>(null)

export function hasRole(user: SessionUser | null, role: Role): boolean {
  if (!user) return false
  return role === 'viewer' || user.role === 'dev'
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(AUTH_ENABLED ? 'loading' : 'signed-in')
  const [user, setUser] = useState<SessionUser | null>(AUTH_ENABLED ? null : MOCK_USER)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!AUTH_ENABLED) return
    let cancelled = false
    setStatus('loading')
    getSession()
      .then((session) => {
        if (cancelled) return
        setUser(session)
        setStatus(session ? 'signed-in' : 'signed-out')
      })
      .catch(() => {
        if (!cancelled) setStatus('unreachable')
      })
    return () => {
      cancelled = true
    }
  }, [attempt])

  // Any API call answered with 401 (expired session, password changed, account removed)
  useEffect(
    () =>
      onUnauthorized(() => {
        setUser(null)
        setStatus('signed-out')
      }),
    []
  )

  const signIn = useCallback(async (username: string, password: string) => {
    const session = await apiSignIn(username, password)
    setUser(session)
    setStatus('signed-in')
  }, [])

  const signOut = useCallback(async () => {
    try {
      await apiSignOut()
    } finally {
      setUser(null)
      setStatus('signed-out')
    }
  }, [])

  const value = useMemo<AuthValue>(
    () => ({
      status,
      user,
      can: (role) => hasRole(user, role),
      signIn,
      signOut,
      retry: () => setAttempt((n) => n + 1),
    }),
    [status, user, signIn, signOut]
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
