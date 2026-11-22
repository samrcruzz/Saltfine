import { useSyncExternalStore } from 'react'
import { LogOut, Pause, Play, UserRound } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { useNow } from '../../hooks/useNow'
import { AUTH_ENABLED, ROLE_LABEL } from '../../services/auth'
import { simulation } from '../../mockData/mockStore'
import { USE_MOCK } from '../../services/api'
import { formatDateTime } from '../../utils/format'

function Clock() {
  const now = useNow(1000)
  return (
    <time className="font-mono text-[0.82rem] tabular-nums text-ink-500" dateTime={new Date(now).toISOString()}>
      {formatDateTime(now)}
    </time>
  )
}

function FeedStatus({ connectedLabel }: { connectedLabel: string }) {
  const running = useSyncExternalStore(simulation.subscribe, simulation.isRunning)

  if (!USE_MOCK) {
    return (
      <span className="inline-flex items-center gap-2 text-sm text-ink-500">
        <span className="size-2.5 rounded-full bg-brine-500" aria-hidden="true" />
        {connectedLabel}
      </span>
    )
  }

  return (
    <div className="flex items-center gap-3">
      <span className="inline-flex items-center gap-2 text-sm text-ink-500">
        <span
          className={`size-2.5 rounded-full ${running ? 'animate-pulse-dot bg-brine-500' : 'bg-ink-400'}`}
          aria-hidden="true"
        />
        {running ? 'Simulated feed running' : 'Simulated feed paused'}
      </span>
      <button
        type="button"
        onClick={simulation.toggle}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 text-[0.8rem] font-semibold text-ink-700 hover:bg-canvas"
      >
        {running ? (
          <Pause className="size-3.5" aria-hidden="true" />
        ) : (
          <Play className="size-3.5" aria-hidden="true" />
        )}
        {running ? 'Pause' : 'Resume'}
      </button>
    </div>
  )
}

function UserMenu() {
  const { user, signOut } = useAuth()
  if (!AUTH_ENABLED || !user) return null
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-flex items-center gap-1.5 text-sm text-ink-700">
        <UserRound className="size-4 text-ink-400" aria-hidden="true" />
        {user.username}
        <span className="rounded bg-canvas px-1.5 py-0.5 text-[0.68rem] font-semibold uppercase tracking-wider text-ink-500">
          {ROLE_LABEL[user.role]}
        </span>
      </span>
      <button
        type="button"
        onClick={signOut}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-panel px-2.5 text-[0.8rem] font-semibold text-ink-700 hover:bg-canvas"
      >
        <LogOut className="size-3.5" aria-hidden="true" />
        Sign out
      </button>
    </div>
  )
}

export interface HeaderProps {
  title: string
  connectedLabel: string
}

export default function Header({ title, connectedLabel }: HeaderProps) {
  return (
    <header className="border-b border-line bg-panel xl:sticky xl:top-0 xl:z-20">
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-5 lg:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-[1.4rem]">{title}</h1>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <FeedStatus connectedLabel={connectedLabel} />
          <Clock />
          <UserMenu />
        </div>
      </div>
    </header>
  )
}
