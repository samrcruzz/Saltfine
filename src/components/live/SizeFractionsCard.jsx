import { GRADE_META, GRADES } from '../../config.js'
import Card from '../ui/Card.jsx'

const FRACTION_KEY = {
  Fine: 'est_fine_pct',
  Medium: 'est_medium_pct',
  Coarse: 'est_coarse_pct',
}

// Estimated share of the batch in each size class.
export default function SizeFractionsCard({ record }) {
  return (
    <Card title="Estimated size fractions">
      <ul className="space-y-3.5">
        {GRADES.map((grade) => {
          const meta = GRADE_META[grade]
          const value = record[FRACTION_KEY[grade]]
          return (
            <li key={grade} className="grid grid-cols-[5.5rem_minmax(0,1fr)_3.75rem] items-center gap-3">
              <div>
                <div className="text-sm font-medium text-ink-900">{grade}</div>
                <div className="font-mono text-[0.66rem] text-ink-400">{meta.range}</div>
              </div>
              <div
                className={`h-2.5 overflow-hidden rounded-full ${meta.track}`}
                role="progressbar"
                aria-label={`${grade} fraction`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={value}
              >
                <div
                  className={`h-full rounded-full ${meta.fill} transition-[width] duration-500`}
                  style={{ width: `${value}%` }}
                />
              </div>
              <div className="text-right text-[0.95rem] font-semibold tabular-nums text-ink-900">
                {value.toFixed(1)} %
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
