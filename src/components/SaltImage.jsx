import { useEffect, useRef } from 'react'
import { getImageUrl } from '../services/api.js'
import {
  drawSaltImage,
  FIELD_OF_VIEW_MM,
  IMAGE_HEIGHT,
  IMAGE_WIDTH,
  SCALE_BAR_MM,
} from '../utils/drawSaltImage.js'
import { formatBatchId } from '../utils/format.js'

// The captured image of one batch.
// API mode: the real photo served by the backend.
// Mock mode: a simulated frame drawn on a canvas, labelled as simulated.
export default function SaltImage({ record, className = '' }) {
  const canvasRef = useRef(null)
  const imageUrl = getImageUrl(record)

  useEffect(() => {
    if (!imageUrl && canvasRef.current) drawSaltImage(canvasRef.current, record)
  }, [record, imageUrl])

  const label = `Captured image of crushed salt for batch ${formatBatchId(record.batch_id)}, predicted grade ${record.predicted_grade}`

  return (
    <div className={`@container relative aspect-[3/2] overflow-hidden rounded-lg bg-navy-950 ${className}`}>
      {imageUrl ? (
        <img src={imageUrl} alt={label} className="size-full object-cover" />
      ) : (
        <>
          <canvas
            ref={canvasRef}
            width={IMAGE_WIDTH}
            height={IMAGE_HEIGHT}
            role="img"
            aria-label={label}
            className="block size-full"
          />

          <span className="absolute right-3 top-3 rounded bg-navy-950/70 px-2 py-1 font-mono text-[0.68rem] uppercase tracking-wider text-white/85">
            Simulated image
          </span>

          {/* Scale bar: the frame is FIELD_OF_VIEW_MM wide. */}
          <div className="absolute bottom-3 left-3 w-full" aria-hidden="true">
            <div className="inline-block rounded bg-navy-950/75 px-2 pb-1.5 pt-1 text-white">
              <div className="font-mono text-[0.68rem] leading-none">{SCALE_BAR_MM} mm</div>
              {/* The bar's width is the true on-screen length of SCALE_BAR_MM. */}
              <div
                className="mt-1 h-1.5 border-x-2 border-b-2 border-white"
                style={{ width: `calc(${(SCALE_BAR_MM / FIELD_OF_VIEW_MM) * 100}cqw)` }}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}
