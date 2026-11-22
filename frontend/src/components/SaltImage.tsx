import { useEffect, useRef, useState } from 'react'
import { apiUrl, getImageUrl, originalOf, USE_MOCK } from '../services/api'
import type { SaltRecord } from '../types/saltfine'
import {
  drawSaltImage,
  FIELD_OF_VIEW_MM,
  IMAGE_HEIGHT,
  IMAGE_WIDTH,
  SCALE_BAR_MM,
} from '../utils/drawSaltImage'
import { formatBatchId } from '../utils/format'

export interface SaltImageProps {
  record: SaltRecord
  className?: string
}

export default function SaltImage({ record, className = '' }: SaltImageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const highlightedUrl = getImageUrl(record)
  const originalPath = originalOf(record.file_path)
  const originalUrl = originalPath ? apiUrl(originalPath) : null
  const [showOriginal, setShowOriginal] = useState(false)

  useEffect(() => setShowOriginal(false), [record.record_id])
  useEffect(() => {
    if (USE_MOCK && !highlightedUrl && canvasRef.current) drawSaltImage(canvasRef.current, record)
  }, [record, highlightedUrl])

  const label = `Captured image of salt for batch ${formatBatchId(record.batch_id)}, predicted grade ${record.predicted_grade}`
  const src = showOriginal && originalUrl ? originalUrl : highlightedUrl

  return (
    <div className={`@container relative aspect-[3/2] overflow-hidden rounded-lg bg-navy-950 ${className}`}>
      {src ? (
        <>
          <img src={src} alt={label} className="size-full object-contain" />
          {originalUrl && (
            <div className="absolute right-3 top-3 flex overflow-hidden rounded border border-white/20 text-[0.68rem] font-semibold uppercase tracking-wider">
              <button
                type="button"
                onClick={() => setShowOriginal(false)}
                className={`px-2 py-1 ${!showOriginal ? 'bg-white text-navy-950' : 'bg-navy-950/70 text-white/85'}`}
              >
                YOLOv8 highlight
              </button>
              <button
                type="button"
                onClick={() => setShowOriginal(true)}
                className={`px-2 py-1 ${showOriginal ? 'bg-white text-navy-950' : 'bg-navy-950/70 text-white/85'}`}
              >
                Original
              </button>
            </div>
          )}
          {originalUrl && !showOriginal && (
            <div className="absolute bottom-3 left-3 flex gap-3 rounded bg-navy-950/75 px-2 py-1 text-[0.7rem] text-white">
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#00c800]" />Salt</span>
              <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[#e60000]" />Impurity</span>
            </div>
          )}
        </>
      ) : USE_MOCK ? (
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
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-1 text-center text-sm text-white/70">
          <span className="font-semibold text-white/85">No photo for this record</span>
          <span className="text-xs">Upload a photo or trigger a camera cycle to analyze it with the model</span>
        </div>
      )}
    </div>
  )
}
