import type { SaltRecord } from '../../types/saltfine'
import { formatNumber } from '../../utils/format'
import Card from '../ui/Card'
import DataRow from '../ui/DataRow'

export interface ParticleCardProps {
  record: SaltRecord
}

// Counts and area share as detected by YOLOv8 on the photo
export default function ParticleCard({ record }: ParticleCardProps) {
  return (
    <Card title="Particle & Vision Metrics">
      <dl className="divide-y divide-line-soft">
        <DataRow label="Total particles scanned">{formatNumber(record.particle_count)}</DataRow>
        <DataRow label="Clean salt crystals">
          <span className="font-mono font-medium text-emerald-400">{formatNumber(record.salt_crystal_count)}</span>
        </DataRow>
        <DataRow label="Foreign impurity specks">
          <span className="font-mono font-medium text-rose-400">{formatNumber(record.impurity_count)}</span>
        </DataRow>
        <DataRow label="Impurity share of detected area">{record.contamination_area_pct.toFixed(2)} %</DataRow>
      </dl>
    </Card>
  )
}
