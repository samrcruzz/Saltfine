import { ChevronLeft, ChevronRight } from 'lucide-react'

// Page numbers to show, with '…' gaps: 1 … 4 5 6 … 12
function pageWindow(page, pageCount) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1)

  const pages = new Set([1, pageCount, page - 1, page, page + 1])
  if (page <= 3) [2, 3, 4].forEach((p) => pages.add(p))
  if (page >= pageCount - 2) [pageCount - 3, pageCount - 2, pageCount - 1].forEach((p) => pages.add(p))

  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b)
  const result = []
  sorted.forEach((p, index) => {
    if (index > 0 && p - sorted[index - 1] > 1) result.push(`gap-${p}`)
    result.push(p)
  })
  return result
}

const buttonBase =
  'grid h-9 min-w-9 place-items-center rounded-md border px-2 text-sm font-medium tabular-nums transition-colors'

export default function Pagination({ page, pageCount, onPageChange }) {
  if (pageCount <= 1) return null

  return (
    <nav className="flex items-center gap-1.5" aria-label="Pagination">
      <button
        type="button"
        className={`${buttonBase} border-line bg-panel text-ink-700 hover:bg-canvas disabled:opacity-40`}
        onClick={() => onPageChange(page - 1)}
        disabled={page === 1}
        aria-label="Previous page"
      >
        <ChevronLeft className="size-4" aria-hidden="true" />
      </button>

      {pageWindow(page, pageCount).map((item) =>
        typeof item === 'string' ? (
          <span key={item} className="px-1 text-ink-400" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => onPageChange(item)}
            aria-current={item === page ? 'page' : undefined}
            aria-label={`Page ${item}`}
            className={`${buttonBase} ${
              item === page
                ? 'border-navy-800 bg-navy-800 text-white'
                : 'border-line bg-panel text-ink-700 hover:bg-canvas'
            }`}
          >
            {item}
          </button>
        ),
      )}

      <button
        type="button"
        className={`${buttonBase} border-line bg-panel text-ink-700 hover:bg-canvas disabled:opacity-40`}
        onClick={() => onPageChange(page + 1)}
        disabled={page === pageCount}
        aria-label="Next page"
      >
        <ChevronRight className="size-4" aria-hidden="true" />
      </button>
    </nav>
  )
}
