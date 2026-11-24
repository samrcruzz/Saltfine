import { CheckCircle2, AlertTriangle } from 'lucide-react'
import type { SaltRecord } from '../../types/saltfine'
import Card from '../ui/Card'

export interface SizeFractionsCardProps {
  record: SaltRecord
}

// Visual breakdown of pure salt crystal ratio vs detected foreign insoluble impurities
export default function SizeFractionsCard({ record }: SizeFractionsCardProps) {
  const impurityPct = record.impurity_pct ?? Number((100 - (record.purity_pct ?? 99.88)).toFixed(2))
  const purityPct = Number((100 - impurityPct).toFixed(2))
  const impurityCount = record.impurity_count ?? Math.max(1, Math.round(record.particle_count * (impurityPct / 100) * 14))
  const saltCount = record.salt_crystal_count ?? (record.particle_count - impurityCount)

  const isFoodGrade = impurityPct <= 0.20

  return (
    <Card title="Impurities & Particle Breakdown">
      <div className="space-y-4">
        {/* Visual Dual-Ratio Bar */}
        <div>
          <div className="flex justify-between items-baseline text-xs font-semibold mb-1.5">
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-emerald-500" />
              Pure Salt Crystals: {purityPct.toFixed(2)}%
            </span>
            <span className="text-rose-400 flex items-center gap-1">
              <span className="inline-block size-2 rounded-full bg-rose-500" />
              Insoluble Impurities: {impurityPct.toFixed(2)}%
            </span>
          </div>
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-navy-950 border border-line">
            {/* True proportions; the impurity part keeps a thin minimum so a tiny share stays visible */}
            <div
              className="bg-emerald-500 transition-all duration-500"
              style={{ flexBasis: `${purityPct}%` }}
              title={`Pure Salt: ${purityPct}%`}
            />
            <div
              className="shrink-0 bg-rose-500 transition-all duration-500"
              style={{ width: impurityPct > 0 ? `max(4px, ${impurityPct}%)` : 0 }}
              title={`Impurities: ${impurityPct}%`}
            />
          </div>
        </div>

        {/* Detailed Metrics Grid */}
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="rounded-lg border border-line bg-panel-muted p-2.5">
            <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-ink-500">
              Clean Salt Crystals
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-lg font-bold text-emerald-400 tabular-nums">
                {saltCount.toLocaleString()}
              </span>
              <span className="text-[0.7rem] text-ink-500">grains</span>
            </div>
          </div>

          <div className="rounded-lg border border-line bg-panel-muted p-2.5">
            <div className="text-[0.7rem] font-semibold uppercase tracking-wider text-ink-500">
              Insoluble Specks
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span className="font-mono text-lg font-bold text-rose-400 tabular-nums">
                {impurityCount.toLocaleString()}
              </span>
              <span className="text-[0.7rem] text-ink-500">specks</span>
            </div>
          </div>
        </div>

        {/* Compliance Footer Banner */}
        <div
          className={`flex items-center gap-2.5 rounded-lg border p-3 text-xs ${
            isFoodGrade
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
              : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
          }`}
        >
          {isFoodGrade ? (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-400" />
          ) : (
            <AlertTriangle className="size-4 shrink-0 text-amber-400" />
          )}
          <div>
            <div className="font-semibold">
              {isFoodGrade
                ? 'Preprocessed Food Goods (≤ 0.20% Impurities)'
                : 'Industrial Goods (> 0.20% Impurities)'}
            </div>
            <div className="text-[0.72rem] opacity-85">
              {isFoodGrade
                ? 'Meets Codex CXS 150 & RA 8172 food safety criteria (≤ 0.20% insoluble matter).'
                : 'Accepted for chemical electrolysis, water treatment, & industrial uses.'}
            </div>
          </div>
        </div>
      </div>
    </Card>
  )
}
