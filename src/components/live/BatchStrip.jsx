import { useNow } from '../../hooks/useNow.js'
import { formatBatchId, formatDateTime, formatRelative } from '../../utils/format.js'

function Item({ label, children, mono = false }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-ink-500">{label}</dt>
      <dd
        className={`mt-0.5 truncate text-ink-900 tabular-nums ${
          mono ? 'font-mono text-[0.95rem] font-medium' : 'text-[0.95rem] font-semibold'
        }`}
      >
        {children}
      </dd>
    </div>
  )
}

// Identifies the sorting cycle shown on the page: batch, sample, timestamp.
export default function BatchStrip({ record }) {
  const now = useNow(1000)

  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-line bg-panel px-5 py-3.5 sm:grid-cols-[1fr_1fr_1.8fr_1fr]">
      <Item label="Batch ID" mono>
        {formatBatchId(record.batch_id)}
      </Item>
      <Item label="Sample ID" mono>
        {record.sample_code}
      </Item>
      <Item label="Timestamp" mono>
        {formatDateTime(record.classified_at)}
      </Item>
      <Item label="Last update">{formatRelative(record.sorted_at, now)}</Item>
    </dl>
  )
}
