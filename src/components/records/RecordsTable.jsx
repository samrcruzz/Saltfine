import { ArrowDown, ArrowUp, ArrowUpDown, Eye } from 'lucide-react'
import { formatConfidence, formatDate, formatRecordId, formatTime } from '../../utils/format.js'
import GradeBadge from '../ui/GradeBadge.jsx'

// Column definitions. `sortKey` makes a column sortable.
const COLUMNS = [
  { id: 'record_id', label: 'Record ID', sortKey: 'record_id' },
  { id: 'classified_at', label: 'Date and time', sortKey: 'classified_at' },
  { id: 'sample_code', label: 'Sample ID' },
  { id: 'predicted_grade', label: 'Predicted grade' },
  { id: 'confidence', label: 'Confidence', sortKey: 'confidence', align: 'right' },
  { id: 'container_grade', label: 'Container' },
  { id: 'mass_g', label: 'Mass (g)', sortKey: 'mass_g', align: 'right' },
  { id: 'image', label: 'Image' },
]

// Below lg (portrait tablet) the table switches to a compact form: tighter
// padding, wrapping headers, and the time under the date. That keeps all
// eight columns on screen without sideways scrolling.
const thBase =
  'px-2 py-3 align-bottom text-[0.7rem] font-semibold uppercase leading-tight tracking-[0.08em] text-ink-500 lg:px-3 lg:whitespace-nowrap min-[1400px]:px-4'
const td = 'px-2 py-3 text-sm text-ink-900 whitespace-nowrap lg:px-3 min-[1400px]:px-4'

function HeaderCell({ column, sort, onSort }) {
  const alignRight = column.align === 'right'

  if (!column.sortKey) {
    return (
      <th scope="col" className={`${thBase} text-left`}>
        {column.label}
      </th>
    )
  }

  const active = sort.key === column.sortKey
  const Icon = !active ? ArrowUpDown : sort.direction === 'asc' ? ArrowUp : ArrowDown

  return (
    <th
      scope="col"
      aria-sort={active ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={`${thBase} ${alignRight ? 'text-right' : 'text-left'}`}
    >
      <button
        type="button"
        onClick={() => onSort(column.sortKey)}
        className={`inline-flex items-end gap-1 rounded text-left uppercase leading-tight tracking-[0.08em] hover:text-ink-900 ${
          active ? 'text-ink-900' : ''
        }`}
      >
        {column.label}
        <Icon className={`size-3.5 shrink-0 ${active ? '' : 'opacity-50'}`} aria-hidden="true" />
      </button>
    </th>
  )
}

export default function RecordsTable({ records, sort, onSort, onViewImage }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[600px] border-collapse">
        <thead>
          <tr className="bg-canvas">
            {COLUMNS.map((column) => (
              <HeaderCell key={column.id} column={column} sort={sort} onSort={onSort} />
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line-soft">
          {records.map((record) => (
            <tr key={record.record_id} className="hover:bg-canvas/60">
              <td className={`${td} font-mono text-[0.82rem]`}>{formatRecordId(record.record_id)}</td>
              <td className={`${td} font-mono text-[0.82rem] tabular-nums`}>
                {formatDate(record.classified_at)}{' '}
                <span className="block text-ink-500 lg:inline lg:text-ink-900">
                  {formatTime(record.classified_at, { seconds: false })}
                </span>
              </td>
              <td className={`${td} font-mono text-[0.82rem]`}>{record.sample_code}</td>
              <td className={td}>
                <GradeBadge grade={record.predicted_grade} />
              </td>
              <td className={`${td} text-right tabular-nums`}>{formatConfidence(record.confidence)}</td>
              <td className={td}>{record.container_grade}</td>
              <td className={`${td} text-right tabular-nums`}>{record.mass_g.toFixed(1)}</td>
              <td className={td}>
                <button
                  type="button"
                  onClick={() => onViewImage(record)}
                  aria-label={`View image for record ${formatRecordId(record.record_id)}`}
                  className="inline-flex items-center gap-1.5 rounded text-sm font-semibold text-grade-medium-ink hover:underline"
                >
                  <Eye className="size-4" aria-hidden="true" />
                  View
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
