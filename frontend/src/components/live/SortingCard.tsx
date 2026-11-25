import { ArrowDown } from 'lucide-react'
import { BIN_DISPLAY_CAPACITY_G, GRADE_META, PURITY_GRADES } from '../../config'
import type { FinenessGrade, PurityGrade, SaltRecord } from '../../types/saltfine'
import { formatNumber, gramsToKg } from '../../utils/format'
import Card from '../ui/Card'
import DataRow from '../ui/DataRow'

// The two automated destination bins under the servo-actuated tipping plate
function BinDiagram({ container, massG, impurityPct }: { container: string; massG: number; impurityPct: number }) {
  const fillPercent = Math.min(100, Math.max(15, (massG / BIN_DISPLAY_CAPACITY_G) * 100))

  const activeTier: PurityGrade =
    container === 'Preprocessed Food Goods' || (container !== 'Industrial Goods' && impurityPct <= 0.20)
      ? 'Preprocessed Food Goods'
      : 'Industrial Goods'

  return (
    <div
      className="grid grid-cols-2 gap-3"
      role="img"
      aria-label={`Salt routed to the ${activeTier} container: ${massG.toFixed(1)} grams`}
    >
      {PURITY_GRADES.map((grade) => {
        const active = grade === activeTier
        const meta = GRADE_META[grade]
        const shortName = grade === 'Preprocessed Food Goods' ? 'Food Bin' : 'Industrial Bin'
        return (
          <div key={grade} className="text-center">
            <div className="grid h-5 place-items-center">
              {active && <ArrowDown className={`size-4 ${meta.ink}`} aria-hidden="true" />}
            </div>
            <div
              className={`relative h-[4.5rem] overflow-hidden rounded-b-lg border-x-2 border-b-2 ${
                active ? meta.border : 'border-line'
              }`}
            >
              {active && (
                <div
                  className={`absolute inset-x-0 bottom-0 ${meta.track} transition-[height] duration-500`}
                  style={{ height: `${fillPercent}%` }}
                />
              )}
              <div
                className={`absolute inset-0 grid place-items-center text-sm tabular-nums ${
                  active ? 'font-semibold text-ink-900' : 'text-ink-400'
                }`}
              >
                {active ? `${massG.toFixed(1)} g` : '—'}
              </div>
            </div>
            <div className={`mt-1.5 text-[0.75rem] ${active ? 'font-semibold text-ink-900' : 'text-ink-500'}`}>
              {shortName}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export interface SortingCardProps {
  record: SaltRecord
}

export default function SortingCard({ record }: SortingCardProps) {
  const impurityPct = record.impurity_pct
  const destination =
    impurityPct <= 0.20
      ? 'Bin 1: Preprocessed Food Goods (≤ 0.20%)'
      : 'Bin 2: Industrial Goods (> 0.20%)'

  return (
    <Card title="Automated Sorter Actuation">
      <BinDiagram
        container={String(record.container_grade)}
        massG={record.mass_g}
        impurityPct={impurityPct}
      />

      <dl className="mt-3 divide-y divide-line-soft">
        <DataRow label="Target Destination">
          <span className="font-semibold text-ink-900">{destination}</span>
        </DataRow>
        <DataRow label="Batch Net Mass (entered)">
          {formatNumber(record.mass_g, 1)} g
          <span className="ml-2 text-sm font-normal text-ink-500">
            ({gramsToKg(record.mass_g).toFixed(3)} kg)
          </span>
        </DataRow>
        {/* measured image-analysis time; the servo/conveyor is not timed yet */}
        <DataRow label="Analysis Processing Time">{record.processing_time_s.toFixed(2)} s</DataRow>
      </dl>
    </Card>
  )
}
