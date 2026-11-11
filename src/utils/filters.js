import { formatBatchId, formatDate, formatRecordId } from './format.js'

// Filter shape shared by the Salt-Record Log and the Reports page.
//   from / to : 'YYYY-MM-DD' (inclusive) or '' for no limit
//   grade     : 'All' | 'Fine' | 'Medium' | 'Coarse'
//   query     : free text matched against sample ID, batch ID and record ID
export const EMPTY_FILTERS = Object.freeze({ from: '', to: '', grade: 'All', query: '' })

export function matchesFilters(record, filters = EMPTY_FILTERS) {
  const { from, to, grade, query } = filters

  if (from || to) {
    const day = formatDate(record.classified_at)
    if (from && day < from) return false
    if (to && day > to) return false
  }

  if (grade && grade !== 'All' && record.predicted_grade !== grade) return false

  const text = query?.trim().toLowerCase()
  if (text) {
    const haystack = [
      record.sample_code,
      formatBatchId(record.batch_id),
      formatRecordId(record.record_id),
    ]
      .join(' ')
      .toLowerCase()
    if (!haystack.includes(text)) return false
  }

  return true
}

export function hasActiveFilters(filters) {
  return Boolean(
    filters.from || filters.to || filters.query?.trim() || (filters.grade && filters.grade !== 'All'),
  )
}

// Human-readable period, e.g. "2026-11-01 to 2026-11-10" or "All records".
export function describePeriod({ from, to }) {
  if (from && to) return from === to ? from : `${from} to ${to}`
  if (from) return `From ${from}`
  if (to) return `Up to ${to}`
  return 'All records'
}
