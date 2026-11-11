import { useSyncExternalStore } from 'react'
import { Pause, Play } from 'lucide-react'
import { useNow } from '../../hooks/useNow.js'
import { simulation } from '../../mockData/mockStore.js'
import { USE_MOCK } from '../../services/api.js'
import { formatDateTime } from '../../utils/format.js'

function Clock() {
  const now = useNow(1000)
  return (
    <time className="font-mono text-[0.82rem] tabular-nums text-ink-500" dateTime={new Date(now).toISOString()}>
      {formatDateTime(now)}
    </time>
  )
}

// Mock mode: says plainly that the feed is simulated and lets the presenter
// pause it. API mode: shows the connection label for the current page.
function FeedStatus({ connectedLabel }) {
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

export default function Header({ title, connectedLabel }) {
  return (
    <header className="border-b border-line bg-panel xl:sticky xl:top-0 xl:z-20">
      <div className="flex min-h-16 flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-3 sm:px-5 lg:px-8">
        <h1 className="text-xl font-semibold tracking-tight text-ink-900 sm:text-[1.4rem]">{title}</h1>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <FeedStatus connectedLabel={connectedLabel} />
          <Clock />
        </div>
      </div>
    </header>
  )
}
