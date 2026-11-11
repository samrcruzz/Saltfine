import { formatTime } from '../../utils/format.js'
import Card from '../ui/Card.jsx'
import GradeBadge from '../ui/GradeBadge.jsx'

const th = 'px-3 py-2.5 text-left text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-500'
const td = 'px-3 py-2.5 text-sm text-ink-900'

export default function RecentRecordsCard({ records, onViewAll, className = '' }) {
  return (
    <Card
      title="Recent records"
      className={className}
      action={
        <button
          type="button"
          onClick={onViewAll}
          className="rounded text-[0.8rem] font-semibold text-grade-medium-ink hover:underline"
        >
          View all
        </button>
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-canvas">
              <th scope="col" className={th}>
                Time
              </th>
              <th scope="col" className={th}>
                Sample
              </th>
              <th scope="col" className={th}>
                Grade
              </th>
              <th scope="col" className={`${th} text-right`}>
                Mass (g)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {records.map((record) => (
              <tr key={record.record_id}>
                <td className={`${td} font-mono text-[0.82rem] tabular-nums`}>
                  {formatTime(record.classified_at)}
                </td>
                <td className={`${td} font-mono text-[0.82rem]`}>{record.sample_code}</td>
                <td className={td}>
                  <GradeBadge grade={record.predicted_grade} />
                </td>
                <td className={`${td} text-right tabular-nums`}>{record.mass_g.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
