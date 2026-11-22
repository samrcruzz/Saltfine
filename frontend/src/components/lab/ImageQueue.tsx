import { AlertCircle, CheckCircle2, Loader2, X } from 'lucide-react'

export type QueueStatus = 'queued' | 'analyzing' | 'done' | 'failed'

export interface QueueThumb {
  id: string
  name: string
  size: number
  previewUrl: string
  status: QueueStatus
  error?: string
}

const STATUS_LABEL: Record<QueueStatus, string> = {
  queued: 'Ready',
  analyzing: 'Analyzing…',
  done: 'Done',
  failed: 'Failed',
}

const STATUS_CLASS: Record<QueueStatus, string> = {
  queued: 'bg-navy-900/80 text-white',
  analyzing: 'bg-brand-500/90 text-white',
  done: 'bg-emerald-600/90 text-white',
  failed: 'bg-rose-600/90 text-white',
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export interface ImageQueueProps {
  items: QueueThumb[]
  selectedId?: string | null
  /** Removing is blocked for images that are being analyzed. */
  onRemove: (id: string) => void
  /** Open a finished image in the inspector. */
  onOpen: (id: string) => void
}

export default function ImageQueue({ items, selectedId, onRemove, onOpen }: ImageQueueProps) {
  if (items.length === 0) return null

  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6" aria-label="Selected images">
      {items.map((item) => {
        const canOpen = item.status === 'done'
        const selected = item.id === selectedId
        return (
          <li
            key={item.id}
            className={`group relative overflow-hidden rounded-lg border bg-panel-muted ${
              selected ? 'border-brine-600 ring-2 ring-brine-600/30' : 'border-line'
            }`}
          >
            <button
              type="button"
              onClick={() => canOpen && onOpen(item.id)}
              disabled={!canOpen}
              title={canOpen ? `Inspect ${item.name}` : item.error ?? item.name}
              className="block w-full text-left disabled:cursor-default"
            >
              <div className="relative aspect-square bg-navy-950">
                {item.previewUrl && (
                  <img
                    src={item.previewUrl}
                    alt=""
                    className="size-full object-cover"
                    loading="lazy"
                    // restored item whose photo was removed from the backend: show the dark tile, not a broken icon
                    onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                  />
                )}
                <span
                  className={`absolute bottom-1.5 left-1.5 inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[0.65rem] font-semibold ${STATUS_CLASS[item.status]}`}
                >
                  {item.status === 'analyzing' && <Loader2 className="size-3 animate-spin" aria-hidden="true" />}
                  {item.status === 'done' && <CheckCircle2 className="size-3" aria-hidden="true" />}
                  {item.status === 'failed' && <AlertCircle className="size-3" aria-hidden="true" />}
                  {STATUS_LABEL[item.status]}
                </span>
              </div>
              <div className="px-2 py-1.5">
                <div className="truncate font-mono text-[0.7rem] text-ink-900">{item.name}</div>
                <div className="text-[0.65rem] text-ink-500">
                  {item.status === 'failed' && item.error ? <span className="text-rose-400">{item.error}</span> : formatBytes(item.size)}
                </div>
              </div>
            </button>

            {item.status !== 'analyzing' && (
              <button
                type="button"
                onClick={() => onRemove(item.id)}
                aria-label={`Remove ${item.name}`}
                className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-navy-900/80 text-white opacity-90 transition-opacity hover:bg-rose-600 focus-visible:opacity-100 sm:opacity-0 sm:group-hover:opacity-100"
              >
                <X className="size-3.5" aria-hidden="true" />
              </button>
            )}
          </li>
        )
      })}
    </ul>
  )
}
