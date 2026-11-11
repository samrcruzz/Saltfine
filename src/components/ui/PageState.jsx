import { Inbox, LoaderCircle, TriangleAlert } from 'lucide-react'

function Frame({ icon: Icon, title, children, spin = false, compact = false }) {
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border border-dashed border-line bg-panel px-6 text-center ${
        compact ? 'py-10' : 'py-20'
      }`}
    >
      <Icon className={`size-7 text-ink-400 ${spin ? 'animate-spin' : ''}`} aria-hidden="true" />
      <p className="mt-3 text-base font-semibold text-ink-900">{title}</p>
      {children && <p className="mt-1 max-w-md text-sm text-ink-500">{children}</p>}
    </div>
  )
}

export function LoadingState({ title = 'Loading…', compact }) {
  return <Frame icon={LoaderCircle} title={title} spin compact={compact} />
}

export function ErrorState({ title = 'Could not load the data', error, compact }) {
  return (
    <Frame icon={TriangleAlert} title={title} compact={compact}>
      {error?.message ?? 'Check that the backend is running, then reload the page.'}
    </Frame>
  )
}

export function EmptyState({ title, children, compact }) {
  return (
    <Frame icon={Inbox} title={title} compact={compact}>
      {children}
    </Frame>
  )
}
