import {
  formatBatchId,
  formatConfidence,
  formatDateTime,
  formatNumber,
  formatRecordId,
} from '../../utils/format.js'
import SaltImage from '../SaltImage.jsx'
import DataRow from '../ui/DataRow.jsx'
import GradeBadge from '../ui/GradeBadge.jsx'
import Modal from '../ui/Modal.jsx'

function Section({ title, children }) {
  return (
    <section>
      <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink-500">{title}</h3>
      <dl className="mt-1 divide-y divide-line-soft">{children}</dl>
    </section>
  )
}

// Image preview and full details of one record from the log.
export default function RecordDetailModal({ record, onClose }) {
  return (
    <Modal
      open={Boolean(record)}
      onClose={onClose}
      title={record ? `Record ${formatRecordId(record.record_id)}` : ''}
      subtitle={
        record
          ? `Batch ${formatBatchId(record.batch_id)} · Sample ${record.sample_code} · ${formatDateTime(record.classified_at)}`
          : ''
      }
    >
      {record && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
          <figure>
            <SaltImage record={record} />
            <figcaption className="mt-2.5 break-all font-mono text-[0.8rem] text-ink-500">
              {record.file_path}
            </figcaption>
          </figure>

          <div className="space-y-5">
            <Section title="Classification">
              <DataRow label="Predicted grade">
                <GradeBadge grade={record.predicted_grade} />
              </DataRow>
              <DataRow label="Confidence">{formatConfidence(record.confidence)}</DataRow>
              <DataRow label="Fine / Medium / Coarse">
                {record.est_fine_pct.toFixed(1)} / {record.est_medium_pct.toFixed(1)} /{' '}
                {record.est_coarse_pct.toFixed(1)} %
              </DataRow>
            </Section>

            <Section title="Particle characteristics">
              <DataRow label="Particle count">{formatNumber(record.particle_count)}</DataRow>
              <DataRow label="Mean equivalent diameter">{record.mean_ecd_mm.toFixed(2)} mm</DataRow>
              <DataRow label="Median equivalent diameter">{record.median_ecd_mm.toFixed(2)} mm</DataRow>
            </Section>

            <Section title="Sorting and mass">
              <DataRow label="Container">{record.container_grade}</DataRow>
              <DataRow label="Mass">{formatNumber(record.mass_g, 1)} g</DataRow>
              <DataRow label="Processing time">{record.processing_time_s.toFixed(1)} s</DataRow>
            </Section>
          </div>
        </div>
      )}
    </Modal>
  )
}
