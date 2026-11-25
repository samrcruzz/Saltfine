import React from 'react'
import type { SaltRecord } from '../../types/saltfine'
import {
  formatBatchId,
  formatConfidence,
  formatDateTime,
  formatNumber,
  formatRecordId,
} from '../../utils/format'
import SaltImage from '../SaltImage'
import DataRow from '../ui/DataRow'
import DemoBadge from '../ui/DemoBadge'
import GradeBadge from '../ui/GradeBadge'
import Modal from '../ui/Modal'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.1em] text-ink-500">{title}</h3>
      <dl className="mt-1 divide-y divide-line-soft">{children}</dl>
    </section>
  )
}

export interface RecordDetailModalProps {
  record: SaltRecord | null
  onClose: () => void
}

// Image preview and full details of one record from the log.
export default function RecordDetailModal({ record, onClose }: RecordDetailModalProps) {
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
            {record.is_demo && (
              <p className="flex items-center gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                <DemoBadge /> Simulated demo record: these numbers were not measured from a photo.
              </p>
            )}

            <Section title="Classification">
              <DataRow label="Predicted grade">
                <GradeBadge grade={record.predicted_grade} />
              </DataRow>
              <DataRow label="Impurities">{record.impurity_pct.toFixed(2)} %</DataRow>
              <DataRow label="Confidence">{formatConfidence(record.confidence)}</DataRow>
              <DataRow label="Model">{record.model_name}</DataRow>
            </Section>

            <Section title="Detected particles">
              <DataRow label="Particle count">{formatNumber(record.particle_count)}</DataRow>
              <DataRow label="Salt crystals / impurities">
                {formatNumber(record.salt_crystal_count)} / {formatNumber(record.impurity_count)}
              </DataRow>
            </Section>

            <Section title="Sorting and mass">
              <DataRow label="Container">{record.container_grade}</DataRow>
              <DataRow label="Mass (entered)">{formatNumber(record.mass_g, 1)} g</DataRow>
              <DataRow label="Processing time">{record.processing_time_s.toFixed(2)} s</DataRow>
              <DataRow label="Inference time">{record.inference_ms.toFixed(0)} ms</DataRow>
            </Section>
          </div>
        </div>
      )}
    </Modal>
  )
}
