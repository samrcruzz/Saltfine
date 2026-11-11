import { useCallback, useMemo, useState } from 'react'
import RecordDetailModal from '../components/records/RecordDetailModal.jsx'
import RecordFilters from '../components/records/RecordFilters.jsx'
import RecordsTable from '../components/records/RecordsTable.jsx'
import Card from '../components/ui/Card.jsx'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/PageState.jsx'
import Pagination from '../components/ui/Pagination.jsx'
import { LOG_REFRESH_INTERVAL_MS, PAGE_SIZE_OPTIONS } from '../config.js'
import { usePolledQuery } from '../hooks/usePolledQuery.js'
import { getRecords } from '../services/api.js'
import { EMPTY_FILTERS, hasActiveFilters } from '../utils/filters.js'
import { formatNumber } from '../utils/format.js'

const DEFAULT_SORT = { key: 'classified_at', direction: 'desc' }

function sortRecords(records, { key, direction }) {
  const factor = direction === 'asc' ? 1 : -1
  return [...records].sort((a, b) => {
    if (a[key] < b[key]) return -1 * factor
    if (a[key] > b[key]) return 1 * factor
    return (a.record_id - b.record_id) * factor
  })
}

// Tab 2: searchable, filterable history of every classification record.
export default function SaltRecordLog() {
  // `draft` is what the form shows; `applied` is what the table is filtered by.
  const [draft, setDraft] = useState(EMPTY_FILTERS)
  const [applied, setApplied] = useState(EMPTY_FILTERS)
  const [sort, setSort] = useState(DEFAULT_SORT)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(PAGE_SIZE_OPTIONS[0])
  const [selected, setSelected] = useState(null)

  const { data, loading, error } = usePolledQuery(() => getRecords(applied), [applied], {
    intervalMs: LOG_REFRESH_INTERVAL_MS,
    signature: (rows) => `${rows.length}:${rows[0]?.record_id ?? ''}`,
  })

  const sorted = useMemo(() => sortRecords(data ?? [], sort), [data, sort])

  const total = sorted.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))
  const currentPage = Math.min(page, pageCount)
  const firstIndex = (currentPage - 1) * pageSize
  const visible = sorted.slice(firstIndex, firstIndex + pageSize)

  const applyFilters = () => {
    setApplied({ ...draft, query: draft.query.trim() })
    setPage(1)
  }

  const resetFilters = () => {
    setDraft(EMPTY_FILTERS)
    setApplied(EMPTY_FILTERS)
    setPage(1)
  }

  const changeSort = (key) => {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: 'desc' },
    )
    setPage(1)
  }

  const closeModal = useCallback(() => setSelected(null), [])

  let body
  if (!data && loading) {
    body = <LoadingState title="Loading records…" compact />
  } else if (!data && error) {
    body = <ErrorState error={error} compact />
  } else if (total === 0) {
    body = (
      <EmptyState title="No records match these filters" compact>
        Try a wider date range, another grade, or clear the search text.
      </EmptyState>
    )
  } else {
    body = <RecordsTable records={visible} sort={sort} onSort={changeSort} onViewImage={setSelected} />
  }

  return (
    <div className="space-y-5">
      <RecordFilters
        value={draft}
        onChange={setDraft}
        onApply={applyFilters}
        onReset={resetFilters}
        canReset={hasActiveFilters(draft) || hasActiveFilters(applied)}
      />

      <Card
        title="Classification records"
        action={
          <label className="flex items-center gap-2 text-[0.8rem] text-ink-500">
            Rows per page
            <select
              value={pageSize}
              onChange={(event) => {
                setPageSize(Number(event.target.value))
                setPage(1)
              }}
              className="h-8 rounded-md border border-line bg-panel px-2 text-[0.8rem] text-ink-900"
            >
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
          </label>
        }
      >
        {body}

        {total > 0 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-ink-500" aria-live="polite">
              Showing records {formatNumber(firstIndex + 1)}–
              {formatNumber(Math.min(firstIndex + pageSize, total))} of {formatNumber(total)}
            </p>
            <Pagination page={currentPage} pageCount={pageCount} onPageChange={setPage} />
          </div>
        )}
      </Card>

      <RecordDetailModal record={selected} onClose={closeModal} />
    </div>
  )
}
