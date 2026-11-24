import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { CircleCheck, TriangleAlert } from 'lucide-react'

export type ToastTone = 'success' | 'error'

export interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

export type ToastFn = (message: string, options?: { tone?: ToastTone }) => void

const ToastContext = createContext<ToastFn | null>(null)

const TOAST_DURATION_MS = 4000

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const showToast: ToastFn = useCallback((message, { tone = 'success' } = {}) => {
    const id = nextId.current
    nextId.current += 1
    setToasts((current) => [...current, { id, message, tone }])
    setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, TOAST_DURATION_MS)
  }, [])

  const value = useMemo(() => showToast, [showToast])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex flex-col items-end gap-2"
        role="status"
        aria-live="polite"
      >
        {toasts.map((toast) => {
          const Icon = toast.tone === 'error' ? TriangleAlert : CircleCheck
          return (
            <div
              key={toast.id}
              className="pointer-events-auto flex max-w-sm animate-toast-in items-start gap-2.5 rounded-lg bg-navy-900 px-4 py-3 text-sm text-white shadow-lg"
            >
              <Icon
                className={`mt-0.5 size-4 shrink-0 ${toast.tone === 'error' ? 'text-amber-300' : 'text-brine-500'}`}
                aria-hidden="true"
              />
              <span className="min-w-0 [overflow-wrap:anywhere]">{toast.message}</span>
            </div>
          )
        })}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastFn {
  const showToast = useContext(ToastContext)
  if (!showToast) throw new Error('useToast must be used inside <ToastProvider>')
  return showToast
}
