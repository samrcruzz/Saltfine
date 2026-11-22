import { useEffect, useState } from 'react'
import { LogIn, TriangleAlert } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import Button from '../components/ui/Button'
import { Field, inputClass } from '../components/ui/Field'
import { APP_NAME, APP_TAGLINE } from '../config'

export default function SignIn() {
  const { signIn } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = `Sign in · ${APP_NAME}`
  }, [])

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await signIn(username, password)
    } catch (err) {
      setError((err as Error).message || 'Could not sign in')
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-navy-900 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-7 text-center text-white">
          <div className="text-[1.9rem] font-bold leading-none tracking-[0.09em]">{APP_NAME}</div>
          <p className="mt-2.5 text-sm text-navy-300">{APP_TAGLINE}</p>
        </div>

        <form onSubmit={submit} className="space-y-4 rounded-xl border border-line bg-panel p-6 shadow-lg">
          <h1 className="text-lg font-semibold text-ink-900">Sign in</h1>

          <Field label="Username">
            {(id) => (
              <input
                id={id}
                className={inputClass}
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
              />
            )}
          </Field>

          <Field label="Password">
            {(id) => (
              <input
                id={id}
                type="password"
                className={inputClass}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            )}
          </Field>

          {error && (
            <p role="alert" className="flex items-start gap-2 rounded-md bg-red-500/10 px-3 py-2 text-sm text-red-700">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}

          <Button type="submit" variant="primary" icon={LogIn} className="w-full justify-center" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </Button>

          <p className="text-center text-xs text-ink-500">Accounts are created by a dev on the server.</p>
        </form>
      </div>
    </main>
  )
}
