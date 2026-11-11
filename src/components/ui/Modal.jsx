import { useEffect, useId, useRef } from 'react'
import { X } from 'lucide-react'

// Accessible dialog: closes on Esc or backdrop click, locks page scroll,
// and returns focus to the element that opened it.
export default function Modal({ open, onClose, title, subtitle, children }) {
  const titleId = useId()
  const closeRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined

    const previouslyFocused = document.activeElement
    const previousOverflow = document.body.style.overflow
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose()
    }

    document.addEventListener('keydown', onKeyDown)
    document.body.style.overflow = 'hidden'
    closeRef.current?.focus()

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = previousOverflow
      previouslyFocused?.focus?.()
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="absolute inset-0 bg-navy-950/60" onClick={onClose} aria-hidden="true" />

      <div className="relative flex max-h-[94dvh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-panel shadow-2xl sm:rounded-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-semibold text-ink-900">
              {title}
            </h2>
            {subtitle && <p className="mt-0.5 text-sm text-ink-500">{subtitle}</p>}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 shrink-0 place-items-center rounded-md text-ink-500 hover:bg-canvas hover:text-ink-900"
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </header>

        <div className="overflow-y-auto px-5 py-5">{children}</div>
      </div>
    </div>
  )
}
