import { useSyncExternalStore } from 'react'
import { LogOut, Pause, Play, UserRound } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { useNow } from '../../hooks/useNow'
import { AUTH_ENABLED, ROLE_LABEL } from '../../services/auth'
import { simulation } from '../../mockData/mockStore'
import { usePolledQuery, type QueryState } from '../../hooks/usePolledQuery'
import { getHealth, USE_MOCK, type ServerHealth } from '../../services/api'
import { formatDateTime } from '../../utils/format'

function Clock() {
  const now = useNow(1000)
  return (
    <time className="font-mono text-[0.82rem] tabular-nums text-ink-500" dateTime={new Date(now).toISOString()}>
      {formatDateTime(now)}
    </time>
  )
}

// How often the header re-checks that the backend and PostgreSQL are up
const HEALTH_POLL_MS = 15_000

type HealthQuery = QueryState<ServerHealth>

function FeedStatus({ connectedLabel, health }: { connectedLabel: string; health: HealthQuery }) {
  const running = useSyncExternalStore(simulation.subscribe, simulation.isRunning)

  if (!USE_MOCK) {
    const offline = health.error != null
    const noDatabase = !offline && health.data?.database === 'memory'
    const dot = offline ? 'bg-rose-500' : noDatabase ? 'bg-amber-400' : 'bg-brine-500'
    const label = offline
      ? 'Server offline: start the backend'
      : noDatabase
        ? 'Database offline: results are not saved'
        : connectedLabel
    return (
      <span
        className={`inline-flex items-center gap-2 text-sm ${offline || noDatabase ? 'font-semibold text-ink-700' : 'text-ink-500'}`}
        role={offline || noDatabase ? 'alert' : undefined}
      >
        <span className={`size-2.5 rounded-full ${dot}`} aria-hidden="true" />
        {label}
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
        {running ? 'Demo: simulated feed running' : 'Demo: simulated feed paused'}
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

// Shown whenever simulated data can appear, so it is never taken for measured results
function DemoBanner({ health }: { health: HealthQuery }) {
  const message = USE_MOCK
    ? 'Demo mode: every result on this dashboard is simulated, not measured from a photo. Unset VITE_DEMO_MODE to use the backend and the YOLOv8 model.'
    : health.data?.demo_data
      ? 'Demo records loaded (SEED_DEMO_DATA=true on the backend): records marked DEMO are simulated, not measured. Do not use them for evaluation.'
      : null
  if (!message) return null
  return (
    <div role="alert" className="border-t border-amber-500/40 bg-amber-500/15 px-4 py-2 text-[0.8rem] font-semibold text-amber-300 sm:px-5 lg:px-8">
      {message}
    </div>
  )
}

export default function Header({ title, connectedLabel }: HeaderProps) {
  // Real status (not a fixed label), so a stopped backend or a lost database shows up before a demo goes wrong
  // No `signature`: every poll must update, so "offline" clears as soon as the server is back
  const health = usePolledQuery<ServerHealth>(() => (USE_MOCK ? Promise.resolve({}) : getHealth()), [], {
    intervalMs: HEALTH_POLL_MS,
  })

  return (
    <header className="border-b border-line bg-panel xl:sticky xl:top-0 xl:z-20">
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-5 lg:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-[1.4rem]">{title}</h1>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <FeedStatus connectedLabel={connectedLabel} health={health} />
          <Clock />
          <UserMenu />
        </div>
      </div>
      <DemoBanner health={health} />
    </header>
  )
}
