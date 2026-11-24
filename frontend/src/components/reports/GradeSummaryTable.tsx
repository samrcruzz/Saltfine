import { GRADE_META } from '../../config'
import type { FinenessGrade } from '../../types/saltfine'
import { formatConfidence, formatNumber, formatPercent } from '../../utils/format'
import type { SummaryResult } from '../../utils/stats'
import Card from '../ui/Card'
import GradeBadge from '../ui/GradeBadge'

const th = 'px-4 py-3 text-[0.7rem] font-semibold uppercase tracking-[0.08em] text-ink-500 whitespace-nowrap'
const td = 'px-4 py-3 text-sm text-ink-900 whitespace-nowrap tabular-nums'

export interface GradeSummaryTableProps {
  summary: SummaryResult
}

export default function GradeSummaryTable({ summary }: GradeSummaryTableProps) {
  return (
    <Card title="Summary per quality grade">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="bg-canvas">
              <th scope="col" className={`${th} text-left`}>
                Grade
              </th>
              <th scope="col" className={`${th} text-left`}>
                Impurity range
              </th>
              <th scope="col" className={`${th} text-right`}>
                Batches
              </th>
              <th scope="col" className={`${th} text-right`}>
                Share
              </th>
              <th scope="col" className={`${th} text-right`}>
                Sorted mass (kg)
              </th>
              <th scope="col" className={`${th} text-right`}>
                Avg. confidence
              </th>
              <th scope="col" className={`${th} text-right`}>
                Avg. time (s)
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line-soft">
            {summary.perGrade.map((row) => (
              <tr key={row.grade}>
                <td className={td}>
                  <GradeBadge grade={row.grade} />
                </td>
                <td className={`${td} font-mono text-[0.8rem] text-ink-500`}>{GRADE_META[row.grade as FinenessGrade].range}</td>
                <td className={`${td} text-right`}>{formatNumber(row.batches)}</td>
                <td className={`${td} text-right`}>{formatPercent(row.sharePct)}</td>
                <td className={`${td} text-right`}>{formatNumber(row.massKg, 2)}</td>
                <td className={`${td} text-right`}>
                  {row.batches ? formatConfidence(row.avgConfidence) : '—'}
                </td>
                <td className={`${td} text-right`}>
                  {row.batches ? row.avgProcessingTimeS.toFixed(1) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-line font-semibold">
              <td className={td} colSpan={2}>
                Total
              </td>
              <td className={`${td} text-right`}>{formatNumber(summary.totalBatches)}</td>
              <td className={`${td} text-right`}>{summary.totalBatches ? '100.0 %' : '—'}</td>
              <td className={`${td} text-right`}>{formatNumber(summary.totalMassKg, 2)}</td>
              <td className={`${td} text-right`}>
                {summary.totalBatches ? formatConfidence(summary.avgConfidence) : '—'}
              </td>
              <td className={`${td} text-right`}>
                {summary.totalBatches ? summary.avgProcessingTimeS.toFixed(1) : '—'}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </Card>
  )
}
