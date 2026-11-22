import { useRef, useState } from 'react'
import {
  CheckCircle2,
  ClipboardList,
  Layers,
  PlayCircle,
  UploadCloud,
  X,
} from 'lucide-react'
import BatchStrip from '../components/live/BatchStrip'
import CapturedImageCard from '../components/live/CapturedImageCard'
import ParticleCard from '../components/live/ParticleCard'
import PredictedGradeCard from '../components/live/PredictedGradeCard'
import RecentRecordsCard from '../components/live/RecentRecordsCard'
import SizeFractionsCard from '../components/live/SizeFractionsCard'
import SortingCard from '../components/live/SortingCard'
import Button from '../components/ui/Button'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/PageState'
import { useToast } from '../components/ui/Toast'
import { LIVE_POLL_INTERVAL_MS } from '../config'
import { usePolledQuery } from '../hooks/usePolledQuery'
import { getLatestRecord, getRecords, triggerNewCycle, uploadImageFile } from '../services/api'
import type { SaltRecord } from '../types/saltfine'

const RECENT_COUNT = 5

export interface LiveResultProps {
  onNavigate?: (id: string) => void
}

interface BatchUploadState {
  current: number
  total: number
  currentFileName: string
  isFinished: boolean
  foodGradeCount: number
  industrialCount: number
}

// Tab 1: Live Classification Result & Real-Time Sorter Ingestion
export default function LiveResult({ onNavigate }: LiveResultProps) {
  const showToast = useToast()
  const [triggering, setTriggering] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const cancelBatchRef = useRef(false)

  const [batchState, setBatchState] = useState<BatchUploadState | null>(null)
  const [overrideRecord, setOverrideRecord] = useState<SaltRecord | null>(null)

  const latest = usePolledQuery<SaltRecord | null>(getLatestRecord, [], {
    intervalMs: LIVE_POLL_INTERVAL_MS,
    signature: (record) => record?.record_id ?? 0,
  })
  const recent = usePolledQuery<SaltRecord[]>(() => getRecords(undefined, { limit: RECENT_COUNT }), [], {
    intervalMs: LIVE_POLL_INTERVAL_MS,
    signature: (rows) => rows[0]?.record_id ?? 0,
  })

  // Hardware or software single cycle trigger
  const handleManualTrigger = async () => {
    setTriggering(true)
    try {
      const newRec = await triggerNewCycle()
      setOverrideRecord(newRec)
      showToast(`Batch B-${String(newRec.batch_id).padStart(4, '0')} sorting completed!`)
    } catch {
      showToast('Could not trigger batch cycle', { tone: 'error' })
    } finally {
      setTriggering(false)
    }
  }

  // Batch Image Upload Handler (e.g., 50 images)
  const handleBatchFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = event.target.files
    if (!fileList || fileList.length === 0) return

    const files = Array.from(fileList)
    const total = files.length
    cancelBatchRef.current = false

    setBatchState({
      current: 1,
      total,
      currentFileName: files[0].name,
      isFinished: false,
      foodGradeCount: 0,
      industrialCount: 0,
    })

    let foodCount = 0
    let indCount = 0

    for (let i = 0; i < total; i++) {
      if (cancelBatchRef.current) {
        showToast('Batch upload stopped by user', { tone: 'error' })
        break
      }

      const file = files[i]
      setBatchState((prev) =>
        prev
          ? {
              ...prev,
              current: i + 1,
              currentFileName: file.name,
            }
          : null
      )

      try {
        const res = await uploadImageFile(file, {
          saveToDb: true,
          sampleCode: `BATCH-${String(i + 1).padStart(3, '0')}`,
        })

        if (res.record) {
          setOverrideRecord(res.record)
          const impPct = res.record.impurity_pct ?? Number((100 - (res.record.purity_pct ?? 99.88)).toFixed(2))
          if (impPct <= 0.20) foodCount++
          else indCount++
        }

        // Brief delay so the user can see each step and live cards update smoothly
        await new Promise((resolve) => setTimeout(resolve, 150))
      } catch (err) {
        console.error('Error uploading batch file:', file.name, err)
      }

      setBatchState((prev) =>
        prev
          ? {
              ...prev,
              foodGradeCount: foodCount,
              industrialCount: indCount,
            }
          : null
      )
    }

    setBatchState((prev) => (prev ? { ...prev, isFinished: true } : null))
    showToast(`✓ Batch processed: ${total} images saved to Salt-Record Log!`)

    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const record = overrideRecord ?? latest.data

  return (
    <div className="space-y-5">
      {/* Top Action Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs font-medium uppercase tracking-wider text-ink-500">
          Telemetry & Sorter Feed
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*"
            onChange={handleBatchFileSelect}
            className="hidden"
          />
          <Button
            variant="secondary"
            size="sm"
            icon={UploadCloud}
            onClick={() => fileInputRef.current?.click()}
            disabled={batchState !== null && !batchState.isFinished}
          >
            Upload Batch Images
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={PlayCircle}
            onClick={handleManualTrigger}
            disabled={triggering || (batchState !== null && !batchState.isFinished)}
          >
            {triggering ? 'Crushing & Imaging…' : 'Trigger Cycle Now'}
          </Button>
        </div>
      </div>

      {/* Batch Processing Indicator Card with 1/50 counter & auto-save to Salt Records */}
      {batchState && (
        <div className="rounded-xl border border-line bg-panel p-4 shadow-sm transition-all duration-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                  batchState.isFinished
                    ? 'bg-emerald-500/15 text-emerald-400'
                    : 'bg-brand-500/15 text-brand-400 animate-pulse'
                }`}
              >
                {batchState.isFinished ? (
                  <CheckCircle2 className="h-5 w-5" />
                ) : (
                  <Layers className="h-5 w-5" />
                )}
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-ink-900">
                    {batchState.isFinished
                      ? 'Batch Complete'
                      : 'Live Batch Ingestion & Classification'}
                  </span>
                  <span className="rounded border border-brand-500/30 bg-brand-500/10 px-2 py-0.5 font-mono text-xs font-bold text-brand-400">
                    {batchState.current} / {batchState.total}
                  </span>
                  <span className="text-xs text-ink-500">
                    ({Math.round((batchState.current / batchState.total) * 100)}%)
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-ink-500">
                  {batchState.isFinished
                    ? `All ${batchState.total} images classified and logged directly into Salt-Record Log.`
                    : `Processing: ${batchState.currentFileName} → Committing result to database`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {batchState.isFinished ? (
                <>
                  <Button
                    variant="primary"
                    size="sm"
                    icon={ClipboardList}
                    onClick={() => onNavigate?.('records')}
                  >
                    View in Salt Records
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={X}
                    onClick={() => setBatchState(null)}
                  >
                    Dismiss
                  </Button>
                </>
              ) : (
                <Button
                  variant="secondary"
                  size="sm"
                  className="text-rose-400 hover:text-rose-300 border-rose-500/30"
                  onClick={() => {
                    cancelBatchRef.current = true
                  }}
                >
                  Stop Batch
                </Button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="mt-3">
            <div className="h-2 w-full overflow-hidden rounded-full bg-navy-950 border border-line">
              <div
                className={`h-full transition-all duration-200 ${
                  batchState.isFinished ? 'bg-emerald-500' : 'bg-brand-500'
                }`}
                style={{
                  width: `${Math.min(100, (batchState.current / batchState.total) * 100)}%`,
                }}
              />
            </div>
          </div>

          {/* Summary counters */}
          <div className="mt-3 flex flex-wrap items-center justify-between border-t border-line/60 pt-2.5 text-xs text-ink-500">
            <div className="flex flex-wrap gap-4">
              <span>
                Food Preprocessed (≤0.20%): <strong className="font-mono text-emerald-400">{batchState.foodGradeCount}</strong>
              </span>
              <span>
                Industrial (&gt;0.20%): <strong className="font-mono text-amber-400">{batchState.industrialCount}</strong>
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              <span>Real-time DB Commit Active</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      {!record ? (
        latest.loading ? (
          <LoadingState title="Waiting for the latest result…" />
        ) : latest.error ? (
          <ErrorState error={latest.error} />
        ) : (
          <EmptyState title="No batches classified yet">
            Upload a batch of images above or trigger a cycle to start classification.
          </EmptyState>
        )
      ) : (
        <div key={record.record_id} className="animate-refresh space-y-5">
          <BatchStrip record={record} />

          <div className="grid gap-5 lg:grid-cols-12 lg:grid-rows-[auto_1fr]">
            <div className="grid content-start gap-5 md:grid-cols-2 lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:grid-cols-1">
              <PredictedGradeCard record={record} />
              <SizeFractionsCard record={record} />
            </div>

            <div className="space-y-5 lg:col-span-7 lg:col-start-1 lg:row-span-2 lg:row-start-1">
              <CapturedImageCard record={record} />
              <div className="grid gap-5 md:grid-cols-2">
                <ParticleCard record={record} />
                <SortingCard record={record} />
              </div>
            </div>

            <RecentRecordsCard
              records={recent.data ?? []}
              onViewAll={() => onNavigate?.('records')}
              className="self-start lg:col-span-5 lg:col-start-8 lg:row-start-2"
            />
          </div>
        </div>
      )}
    </div>
  )
}
