import { formatNumber } from '../../utils/format.js'
import Card from '../ui/Card.jsx'
import DataRow from '../ui/DataRow.jsx'

export default function ParticleCard({ record }) {
  return (
    <Card title="Particle characteristics">
      <dl className="divide-y divide-line-soft">
        <DataRow label="Particle count">{formatNumber(record.particle_count)}</DataRow>
        <DataRow label="Mean equivalent diameter">{record.mean_ecd_mm.toFixed(2)} mm</DataRow>
        <DataRow label="Median equivalent diameter">{record.median_ecd_mm.toFixed(2)} mm</DataRow>
      </dl>
    </Card>
  )
}
