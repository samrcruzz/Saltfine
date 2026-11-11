import { formatTime } from '../../utils/format.js'
import SaltImage from '../SaltImage.jsx'
import Card from '../ui/Card.jsx'

export default function CapturedImageCard({ record }) {
  return (
    <Card title="Captured image">
      <figure>
        <SaltImage record={record} />
        <figcaption className="mt-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-sm text-ink-500">
          <span className="min-w-0 break-all">
            Image file: <span className="font-mono text-[0.8rem] text-ink-700">{record.file_path}</span>
          </span>
          <span className="whitespace-nowrap">
            Captured at{' '}
            <span className="font-mono text-[0.8rem] text-ink-700">{formatTime(record.captured_at)}</span>
          </span>
        </figcaption>
      </figure>
    </Card>
  )
}
