import { GRADE_META, GRADES } from '../../config.js'
import { formatBatchId, formatConfidence, formatDateTime } from '../../utils/format.js'
import Card from '../ui/Card.jsx'
import DataRow from '../ui/DataRow.jsx'

// Three-cell indicator: the predicted grade is filled, the others stay quiet.
function GradeIndicator({ grade }) {
  return (
    <div
      className="grid grid-cols-3 overflow-hidden rounded-lg border border-line"
      role="img"
      aria-label={`Predicted grade: ${grade} (${GRADE_META[grade].range})`}
    >
      {GRADES.map((item) => {
        const active = item === grade
        return (
          <div
            key={item}
            className={`border-l border-line px-2 py-3 text-center first:border-l-0 ${
              active ? GRADE_META[item].solid : 'bg-panel text-ink-400'
            }`}
          >
            <div className="text-[0.95rem] font-bold uppercase tracking-[0.12em]">{item}</div>
            <div className={`mt-0.5 font-mono text-[0.68rem] ${active ? 'text-white/90' : 'text-ink-400'}`}>
              {GRADE_META[item].range}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ConfidenceMeter({ confidence }) {
  const percent = confidence * 100
  return (
    <div className="py-3">
      <div className="flex items-baseline justify-between gap-4">
        <dt className="text-sm text-ink-500">Confidence score</dt>
        <dd className="text-[1.35rem] font-semibold leading-none text-ink-900">
          {formatConfidence(confidence)}
        </dd>
      </div>
      <div
        className="mt-2.5 h-2 overflow-hidden rounded-full bg-line-soft"
        role="progressbar"
        aria-label="Confidence score"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Number(percent.toFixed(1))}
      >
        <div
          className="h-full rounded-full bg-navy-700 transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  )
}

export default function PredictedGradeCard({ record }) {
  return (
    <Card title="Predicted fineness grade">
      <GradeIndicator grade={record.predicted_grade} />

      <dl className="mt-3 divide-y divide-line-soft">
        <ConfidenceMeter confidence={record.confidence} />
        <DataRow label="Sample / Batch ID" mono>
          {record.sample_code} / {formatBatchId(record.batch_id)}
        </DataRow>
        <DataRow label="Classified at" mono>
          {formatDateTime(record.classified_at)}
        </DataRow>
        <DataRow label="Model" mono>
          {record.model_name} · {record.inference_ms.toFixed(0)} ms
        </DataRow>
      </dl>
    </Card>
  )
}
