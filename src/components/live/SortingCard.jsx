import { ArrowDown } from 'lucide-react'
import { BIN_DISPLAY_CAPACITY_G, GRADE_META, GRADES } from '../../config.js'
import { formatNumber, gramsToKg } from '../../utils/format.js'
import Card from '../ui/Card.jsx'
import DataRow from '../ui/DataRow.jsx'

// The three grade bins under the tipping plate. The bin that received this
// batch is highlighted and shows the mass read from the load cell.
function BinDiagram({ container, massG }) {
  const fillPercent = Math.min(100, Math.max(12, (massG / BIN_DISPLAY_CAPACITY_G) * 100))

  return (
    <div
      className="grid grid-cols-3 gap-3"
      role="img"
      aria-label={`Salt routed to the ${container} container: ${massG.toFixed(1)} grams`}
    >
      {GRADES.map((grade) => {
        const active = grade === container
        const meta = GRADE_META[grade]
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
            <div className={`mt-1.5 text-[0.8rem] ${active ? 'font-semibold text-ink-900' : 'text-ink-500'}`}>
              {grade}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default function SortingCard({ record }) {
  return (
    <Card title="Sorting and mass">
      <BinDiagram container={record.container_grade} massG={record.mass_g} />

      <dl className="mt-3 divide-y divide-line-soft">
        <DataRow label="Target container">{record.container_grade}</DataRow>
        <DataRow label="Measured mass">
          {formatNumber(record.mass_g, 1)} g
          <span className="ml-2 text-sm font-normal text-ink-500">
            ({gramsToKg(record.mass_g).toFixed(3)} kg)
          </span>
        </DataRow>
        <DataRow label="Processing time">{record.processing_time_s.toFixed(1)} s</DataRow>
      </dl>
    </Card>
  )
}
