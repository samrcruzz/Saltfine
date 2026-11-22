import { GRADE_META, PURITY_GRADES } from '../../config'
import type { FinenessGrade, PurityGrade, SaltRecord } from '../../types/saltfine'
import { formatBatchId, formatConfidence } from '../../utils/format'
import Card from '../ui/Card'
import DataRow from '../ui/DataRow'

// Two-tier quality indicator based on Impurities %
function GradeIndicator({ grade, impurityPct }: { grade: PurityGrade | FinenessGrade; impurityPct: number }) {
  const activeGrade: PurityGrade =
    grade === 'Preprocessed Food Goods' || (grade !== 'Industrial Goods' && impurityPct <= 0.20)
      ? 'Preprocessed Food Goods'
      : 'Industrial Goods'

  return (
    <div
      className="grid grid-cols-2 overflow-hidden rounded-lg border border-line"
      role="img"
      aria-label={`Predicted quality tier: ${activeGrade} (${GRADE_META[activeGrade].range})`}
    >
      {PURITY_GRADES.map((item) => {
        const active = item === activeGrade
        const meta = GRADE_META[item]
        const shortName = item === 'Preprocessed Food Goods' ? 'Food Preprocessed' : 'Industrial'
        return (
          <div
            key={item}
            className={`border-l border-line px-1.5 py-3 text-center first:border-l-0 transition-colors duration-200 ${
              active ? meta.solid : 'bg-panel text-ink-400'
            }`}
          >
            <div className="text-[0.78rem] font-bold uppercase tracking-[0.05em] sm:text-[0.88rem]">
              {shortName}
            </div>
            <div className={`mt-0.5 font-mono text-[0.66rem] ${active ? 'text-white/90' : 'text-ink-400'}`}>
              {meta.range}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ImpurityMeter({ impurityPct }: { impurityPct: number }) {
  const isFoodGrade = impurityPct <= 0.20

  const barColor = isFoodGrade ? 'bg-emerald-500' : 'bg-amber-500'
  const textColor = isFoodGrade ? 'text-emerald-400' : 'text-amber-400'

  // Normalize scale for visualization: 0.0% to 0.50% range
  const visualPct = Math.min(100, Math.max(8, (impurityPct / 0.50) * 100))

  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-4">
        <div>
          <dt className="text-sm font-medium text-ink-500">Insoluble Impurities Ratio</dt>
          <span className="text-[0.72rem] text-ink-400">
            {isFoodGrade
              ? 'Food Preprocessed (Compliant: ≤ 0.20% Insoluble Matter)'
              : 'Industrial Grade (> 0.20% Impurities)'}
          </span>
        </div>
        <dd className={`text-[1.6rem] font-bold tabular-nums leading-none ${textColor}`}>
          {impurityPct.toFixed(2)}%
        </dd>
      </div>
      <div
        className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-navy-950 border border-line"
        role="progressbar"
        aria-label="Impurity level"
        aria-valuemin={0}
        aria-valuemax={0.5}
        aria-valuenow={impurityPct}
      >
        <div
          className={`h-full rounded-full ${barColor} transition-[width] duration-500`}
          style={{ width: `${visualPct}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between font-mono text-[0.65rem] text-ink-400">
        <span>0.00% (Pure)</span>
        <span className="text-emerald-400">0.20% (Food Limit)</span>
        <span className="text-amber-400">&gt;0.20% (Industrial)</span>
      </div>
    </div>
  )
}

export interface PredictedGradeCardProps {
  record: SaltRecord
}

export default function PredictedGradeCard({ record }: PredictedGradeCardProps) {
  const impurityPct = record.impurity_pct ?? Number((100 - (record.purity_pct ?? 99.88)).toFixed(2))

  return (
    <Card title="Impurities & Quality Classification">
      <GradeIndicator grade={record.predicted_grade} impurityPct={impurityPct} />

      <dl className="mt-3 divide-y divide-line-soft">
        <ImpurityMeter impurityPct={impurityPct} />
        <DataRow label="Classification Status">
          <span className="font-semibold text-ink-900">
            {impurityPct <= 0.20
              ? 'Preprocessed Food Goods (≤ 0.20%)'
              : 'Industrial Goods (> 0.20%)'}
          </span>
        </DataRow>
        <DataRow label="Confidence Score" mono>
          {formatConfidence(record.confidence)}
        </DataRow>
        <DataRow label="Sample / Batch ID" mono>
          {record.sample_code} / {formatBatchId(record.batch_id)}
        </DataRow>
        <DataRow label="Classifier Engine" mono>
          {record.model_name || 'SALTFINE Impurity Detector'} · {record.inference_ms.toFixed(0)} ms
        </DataRow>
      </dl>
    </Card>
  )
}
