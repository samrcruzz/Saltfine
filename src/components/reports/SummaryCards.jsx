import { formatConfidence, formatNumber } from '../../utils/format.js'

function StatTile({ label, value, unit, note }) {
  return (
    <div className="rounded-xl border border-line bg-panel px-5 py-4 shadow-[0_1px_2px_rgb(22_32_44/0.04)]">
      <dt className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-ink-500">{label}</dt>
      <dd className="mt-2">
        <span className="text-[2rem] font-semibold leading-none tracking-tight text-ink-900">{value}</span>
        {unit && <span className="ml-1.5 text-lg font-semibold text-ink-700">{unit}</span>}
        {note && <span className="mt-2 block text-[0.8rem] text-ink-500">{note}</span>}
      </dd>
    </div>
  )
}

// The four headline figures of the report.
export default function SummaryCards({ summary }) {
  const hasData = summary.totalBatches > 0

  return (
    <dl className="grid grid-cols-2 gap-4 xl:grid-cols-4">
      <StatTile
        label="Total batches"
        value={formatNumber(summary.totalBatches)}
        note="Sorting cycles in this period"
      />
      <StatTile
        label="Total sorted mass"
        value={formatNumber(summary.totalMassKg, 1)}
        unit="kg"
        note={hasData ? `${formatNumber(summary.avgMassG, 1)} g per batch on average` : 'No mass recorded'}
      />
      <StatTile
        label="Average confidence"
        value={hasData ? (summary.avgConfidence * 100).toFixed(1) : '0.0'}
        unit="%"
        note={hasData ? `Lowest ${formatConfidence(summary.minConfidence)}` : 'No classifications'}
      />
      <StatTile
        label="Avg. processing time"
        value={summary.avgProcessingTimeS.toFixed(1)}
        unit="s"
        note={
          hasData
            ? `Range ${summary.minProcessingTimeS.toFixed(1)}–${summary.maxProcessingTimeS.toFixed(1)} s`
            : 'No cycles timed'
        }
      />
    </dl>
  )
}
