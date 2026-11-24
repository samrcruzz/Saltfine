import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  Layers,
  Loader2,
  Play,
  RotateCcw,
  Sparkles,
  Square,
  Trash2,
  Upload,
} from 'lucide-react'
import ImageDropzone, { fileKey, MAX_QUEUE_SIZE, validateImageFiles } from '../components/lab/ImageDropzone'
import ImageQueue, { type QueueThumb } from '../components/lab/ImageQueue'
import Button from '../components/ui/Button'
import Card from '../components/ui/Card'
import DataRow from '../components/ui/DataRow'
import GradeBadge from '../components/ui/GradeBadge'
import { useToast } from '../components/ui/Toast'
import { GRADE_META } from '../config'
import { usePersistentState } from '../hooks/usePersistentState'
import { apiUrl, saveRecord, uploadImageFile } from '../services/api'
import { labStore, type StoredLabItem } from '../services/labStore'
import type { FinenessGrade, PurityGrade, SaltRecord, SizeFractions } from '../types/saltfine'
import { formatConfidence, formatNumber } from '../utils/format'

interface AnalyzedSample {
  fileName: string
  fileSize: string
  imageUrl: string
  contourUrl: string
  /** backend path of the highlighted image, stored on the record */
  filePath: string
  modelName: string
  /** false = a fallback produced the numbers, not the YOLOv8 model */
  isModelResult: boolean
  particleCount: number
  purityPct: number
  impurityPct: number
  impurityCount: number
  saltCount: number
  meanEcdMm: number
  medianEcdMm: number
  meanAreaMm2: number
  fractions: SizeFractions
  predictedGrade: PurityGrade | FinenessGrade
  confidence: number
  inferenceMs: number
  glcmContrast: number
  glcmHomogeneity: number
}

/** One picked image: its file, local preview, analysis status and (once done) its result. */
interface QueueItem extends QueueThumb {
  /** Original photo. Not kept after a refresh once analyzed: the backend has it (result.imageUrl). */
  file?: File
  /** duplicate check (name::size::lastModified), kept even when `file` is gone */
  key: string
  result?: AnalyzedSample
  /** true once the result is stored in the Salt-Record Log */
  saved: boolean
}

// What goes into IndexedDB for one queue item (see services/labStore.ts).
function toStored(item: QueueItem, order: number): StoredLabItem<AnalyzedSample> {
  const servedByBackend = !!item.result && /^https?:/.test(item.result.imageUrl)
  return {
    id: item.id,
    order,
    key: item.key,
    name: item.name,
    size: item.size,
    status: item.status,
    error: item.error,
    saved: item.saved,
    result: item.result,
    // drop the photo once the backend has it: keeps the local database small
    file: item.status === 'done' && servedByBackend ? undefined : item.file,
  }
}

function fromStored(s: StoredLabItem<AnalyzedSample>): QueueItem {
  return {
    id: s.id,
    key: s.key,
    name: s.name,
    size: s.size,
    // an analysis cut off by the refresh simply goes back in the queue
    status: s.status === 'analyzing' ? 'queued' : s.status,
    error: s.error,
    saved: s.saved,
    result: s.result,
    file: s.file,
    previewUrl: s.file ? URL.createObjectURL(s.file) : s.result?.imageUrl ?? '',
  }
}

// How many images are sent to the backend at the same time.
const ANALYSIS_CONCURRENCY = 3

// Sends the photo to the backend, which runs the trained YOLOv8 model (ml_service/predict.py)
// and returns the counts plus a red (impurity) / green (salt) highlighted copy of the photo.
async function analyzeWithModel(
  file: File,
  previewUrl: string,
  options: { saveToDb?: boolean; sampleCode?: string } = {},
): Promise<AnalyzedSample> {
  const r = await uploadImageFile(file, options)
  const original = apiUrl(r.fileUrl) ?? previewUrl
  const highlighted = apiUrl(r.annotatedFileUrl ?? r.fileUrl) ?? original
  const purityPct = r.purity_pct ?? 100
  return {
    fileName: r.fileName,
    fileSize: r.fileSize,
    imageUrl: original,
    contourUrl: highlighted,
    filePath: r.annotatedFileUrl ?? r.fileUrl,
    modelName: r.model_name,
    isModelResult: r.is_model_result ?? false,
    particleCount: r.particle_count,
    purityPct,
    impurityPct: r.impurity_pct ?? Number((100 - purityPct).toFixed(2)),
    impurityCount: r.impurity_count ?? 0,
    saltCount: r.salt_crystal_count ?? r.particle_count,
    meanEcdMm: r.mean_ecd_mm,
    medianEcdMm: r.median_ecd_mm,
    meanAreaMm2: r.mean_area_mm2,
    fractions: r.fractions,
    predictedGrade: r.predicted_grade,
    confidence: r.confidence,
    inferenceMs: r.inference_ms,
    glcmContrast: r.glcm_contrast,
    glcmHomogeneity: r.glcm_homogeneity,
  }
}

// Quotes a CSV field when it contains a comma, quote or line break.
function csvField(value: string | number): string {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

const impurityTone = (pct: number): string => (pct <= 0.2 ? 'text-emerald-400' : 'text-amber-400')

const SIZE_FRACTIONS: { key: keyof SizeFractions; label: string }[] = [
  { key: 'fine', label: 'Fine' },
  { key: 'medium', label: 'Medium' },
  { key: 'coarse', label: 'Coarse' },
]

/** Inspector photo: shows "Loading…" while the (large) image downloads, and the not-found note only if it fails. */
function InspectorImage({ src, alt }: { src: string; alt: string }) {
  const [state, setState] = useState<'loading' | 'loaded' | 'error'>('loading')
  return (
    <>
      {state !== 'loaded' && (
        <div className="absolute inset-0 grid place-items-center px-6 text-center text-xs text-white/60">
          {state === 'loading' ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Loading image…
            </span>
          ) : (
            'Photo not found on the backend (it may have been deleted from backend/uploads). The results below are still valid.'
          )}
        </div>
      )}
      <img
        src={src}
        alt={alt}
        className={`relative size-full bg-navy-950 object-contain ${state === 'loaded' ? '' : 'invisible'}`}
        onLoad={() => setState('loaded')}
        onError={() => setState('error')}
      />
    </>
  )
}

export default function LabAnalysis() {
  const showToast = useToast()

  // Small UI settings survive a refresh via localStorage
  const [activeTab, setActiveTab] = usePersistentState<'single' | 'bulk'>('lab.tab', 'single')
  const [activeStage, setActiveStage] = usePersistentState<'original' | 'contour'>('lab.stage', 'contour')

  // Selection queue shared by both tabs (kept in IndexedDB, restored on load)
  const [items, setItems] = useState<QueueItem[]>([])
  const itemsRef = useRef<QueueItem[]>([])
  const nextId = useRef(1)
  const [selectedId, setSelectedId] = usePersistentState<string | null>('lab.selected', null)
  const [autoSave, setAutoSave] = usePersistentState('lab.autoSave', true)
  const [hydrated, setHydrated] = useState(false)
  const storedRef = useRef(new Map<string, QueueItem>())

  // Current analysis run
  const [running, setRunning] = useState(false)
  const [stopping, setStopping] = useState(false)
  const [runIds, setRunIds] = useState<string[]>([])
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const cancelRef = useRef(false)

  useEffect(() => {
    itemsRef.current = items
  }, [items])

  // Restore the queue saved before the last refresh.
  useEffect(() => {
    let cancelled = false
    labStore
      .load<AnalyzedSample>()
      .then((stored) => {
        if (cancelled) return
        const restored = stored.map(fromStored)
        storedRef.current = new Map(restored.map((item) => [item.id, item]))
        nextId.current = 1 + Math.max(0, ...restored.map((item) => Number(item.id.replace(/\D/g, '')) || 0))
        // keep anything added while loading
        setItems((prev) => [...restored, ...prev.filter((p) => !storedRef.current.has(p.id))])
        if (restored.length) labStore.requestPersistence()
      })
      .catch((err) => console.warn('Lab queue could not be restored:', err))
      .finally(() => !cancelled && setHydrated(true))
    return () => {
      cancelled = true
    }
  }, [])

  // Write changes through to IndexedDB: only items that changed, and deletions.
  useEffect(() => {
    if (!hydrated) return // never overwrite the saved queue with the empty first render
    const prev = storedRef.current
    const next = new Map(items.map((item) => [item.id, item]))
    const writes: Promise<void>[] = []
    items.forEach((item, order) => {
      if (prev.get(item.id) !== item) writes.push(labStore.put(toStored(item, order)))
    })
    prev.forEach((_item, id) => {
      if (!next.has(id)) writes.push(labStore.remove(id))
    })
    storedRef.current = next
    Promise.all(writes).catch((err) => console.warn('Lab queue could not be saved on this device:', err))
  }, [items, hydrated])

  // Leaving the page: stop starting new analyses and free the local previews.
  useEffect(
    () => () => {
      cancelRef.current = true
      itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    },
    [],
  )

  const patchItem = (id: string, changes: Partial<QueueItem>) =>
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, ...changes } : item)))

  const addFiles = useCallback(
    (files: File[]) => {
      const current = itemsRef.current
      const { accepted, rejected } = validateImageFiles(
        files,
        new Set(current.map((item) => item.key)),
        MAX_QUEUE_SIZE - current.length,
      )

      if (accepted.length > 0) {
        const added: QueueItem[] = accepted.map((file) => ({
          id: `img-${nextId.current++}`,
          file,
          key: fileKey(file),
          name: file.name,
          size: file.size,
          previewUrl: URL.createObjectURL(file),
          status: 'queued',
          saved: false,
        }))
        // Update the ref right away so a second drop before re-render still sees these files.
        itemsRef.current = [...current, ...added]
        // Functional update so it never overwrites status changes from a running analysis.
        setItems((prev) => [...prev, ...added])
      }

      if (rejected.length > 0) {
        const shown = rejected.slice(0, 3).map((r) => `${r.name} (${r.reason})`).join(', ')
        const more = rejected.length > 3 ? ` and ${rejected.length - 3} more` : ''
        showToast(`Skipped ${rejected.length} file${rejected.length > 1 ? 's' : ''}: ${shown}${more}`, { tone: 'error' })
      }
    },
    [showToast],
  )

  const removeItem = (id: string) => {
    const item = itemsRef.current.find((i) => i.id === id)
    if (!item || item.status === 'analyzing') return
    URL.revokeObjectURL(item.previewUrl)
    itemsRef.current = itemsRef.current.filter((i) => i.id !== id)
    setItems((prev) => prev.filter((i) => i.id !== id))
    if (selectedId === id) setSelectedId(null)
  }

  const clearAll = () => {
    if (running) return
    itemsRef.current.forEach((item) => URL.revokeObjectURL(item.previewUrl))
    itemsRef.current = []
    setItems([])
    setSelectedId(null)
    setRunIds([])
  }

  const openInInspector = (id: string) => {
    setSelectedId(id)
    setActiveStage('contour')
    setActiveTab('single')
  }

  // Analyzes the given images a few at a time; each card and row updates as soon as its image finishes.
  const runAnalysis = async (ids: string[]) => {
    if (ids.length === 0 || running) return
    const total = ids.length
    const saveToDb = autoSave
    const stamp = String(Date.now()).slice(-6)

    cancelRef.current = false
    setRunning(true)
    setStopping(false)
    setRunIds(ids)
    setProgress({ done: 0, total })
    if (total > 1) setActiveTab('bulk')

    let cursor = 0
    let succeeded = 0
    let failed = 0

    const worker = async () => {
      while (!cancelRef.current && cursor < ids.length) {
        const index = cursor++
        const item = itemsRef.current.find((i) => i.id === ids[index])
        if (!item) continue // removed from the queue while waiting
        if (!item.file) {
          failed++
          patchItem(item.id, { status: 'failed', error: 'Original file no longer available. Add it again.' })
          setProgress((p) => ({ ...p, done: p.done + 1 }))
          continue
        }

        patchItem(item.id, { status: 'analyzing', error: undefined })
        try {
          const result = await analyzeWithModel(item.file, item.previewUrl, {
            saveToDb,
            sampleCode: `LAB-${stamp}-${String(index + 1).padStart(2, '0')}`,
          })
          succeeded++
          patchItem(item.id, { status: 'done', result, saved: saveToDb })
          if (total === 1) openInInspector(item.id)
        } catch (err) {
          failed++
          patchItem(item.id, { status: 'failed', error: (err as Error).message || 'Analysis failed' })
        }
        setProgress((p) => ({ ...p, done: p.done + 1 }))
      }
    }

    await Promise.all(Array.from({ length: Math.min(ANALYSIS_CONCURRENCY, total) }, worker))

    const stopped = cancelRef.current
    setRunning(false)
    setStopping(false)

    const savedNote = saveToDb && succeeded > 0 ? ' and saved to Salt-Record Log' : ''
    const plural = (n: number) => `${n} image${n === 1 ? '' : 's'}`
    if (stopped) {
      showToast(`Stopped: ${plural(succeeded)} analyzed${savedNote}. The rest are still queued.`)
    } else if (failed > 0) {
      showToast(`${plural(succeeded)} analyzed${savedNote}, ${failed} failed`, { tone: 'error' })
    } else {
      showToast(`${plural(succeeded)} analyzed with YOLOv8${savedNote}`)
    }
  }

  const stopAnalysis = () => {
    cancelRef.current = true
    setStopping(true)
  }

  const queuedIds = items.filter((i) => i.status === 'queued').map((i) => i.id)
  const failedIds = items.filter((i) => i.status === 'failed').map((i) => i.id)
  const doneItems = items.filter((i) => i.status === 'done' && i.result)
  const progressPct = progress.total ? Math.round((progress.done / progress.total) * 100) : 0

  // Inspector shows the picked image, or the most recently finished one.
  const selectedItem = doneItems.find((i) => i.id === selectedId) ?? doneItems[doneItems.length - 1]
  const sample = selectedItem?.result ?? null
  const selectedIndex = selectedItem ? doneItems.indexOf(selectedItem) : -1
  const stepInspector = (delta: number) => {
    const next = doneItems[selectedIndex + delta]
    if (next) setSelectedId(next.id)
  }

  // Batch table: everything that has been or is being analyzed
  const runIdSet = new Set(runIds)
  const tableItems = items.filter((i) => i.status !== 'queued' || (running && runIdSet.has(i.id)))

  // Save the inspected sample to the Salt Records DB (only needed when auto-save was off)
  const handleLogSampleToDb = async () => {
    if (!selectedItem || !sample || selectedItem.saved) return
    const id = Date.now() % 10000
    const newRecord: SaltRecord = {
      record_id: id,
      model_name: sample.modelName,
      predicted_grade: sample.predictedGrade,
      purity_pct: sample.purityPct,
      impurity_pct: sample.impurityPct ?? Number((100 - sample.purityPct).toFixed(2)),
      impurity_count: sample.impurityCount,
      salt_crystal_count: sample.saltCount,
      contamination_area_pct: sample.impurityPct,
      quality_tier: sample.predictedGrade as PurityGrade,
      confidence: sample.confidence,
      est_fine_pct: sample.fractions.fine,
      est_medium_pct: sample.fractions.medium,
      est_coarse_pct: sample.fractions.coarse,
      inference_ms: sample.inferenceMs,
      classified_at: new Date().toISOString(),
      batch_id: id,
      sample_code: `LAB-${String(id).slice(-4)}`,
      supplier: 'Lab Upload Test',
      image_id: id,
      file_path: sample.filePath,
      captured_at: new Date().toISOString(),
      particle_count: sample.particleCount,
      mean_area_mm2: sample.meanAreaMm2,
      mean_ecd_mm: sample.meanEcdMm,
      median_ecd_mm: sample.medianEcdMm,
      glcm_contrast: sample.glcmContrast,
      glcm_homogeneity: sample.glcmHomogeneity,
      glcm_energy: 0.14,
      glcm_correlation: 0.82,
      sorting_id: id,
      container_grade: sample.predictedGrade,
      mass_g: 250,
      processing_time_s: 14.5,
      sorted_at: new Date().toISOString(),
    }

    try {
      await saveRecord(newRecord)
      patchItem(selectedItem.id, { saved: true })
      showToast(`Saved sample to SALTURE database as Record #${id}!`)
    } catch (err) {
      showToast(`Could not save: ${(err as Error).message}`, { tone: 'error' })
    }
  }

  // Export finished results to CSV
  const exportBulkCsv = () => {
    if (doneItems.length === 0) return
    const header = [
      'Filename', 'Predicted_Grade', 'Purity_Pct', 'Impurity_Pct', 'Impurity_Count', 'Salt_Crystal_Count',
      'Confidence_Pct', 'Particle_Count', 'Fine_Pct', 'Medium_Pct', 'Coarse_Pct', 'Mean_ECD_mm', 'Inference_ms', 'Saved_To_Log',
    ]
    const rows = doneItems.map(({ result: r, saved }) =>
      [
        r!.fileName, r!.predictedGrade, r!.purityPct, r!.impurityPct, r!.impurityCount, r!.saltCount,
        (r!.confidence * 100).toFixed(1), r!.particleCount, r!.fractions.fine, r!.fractions.medium, r!.fractions.coarse,
        r!.meanEcdMm, r!.inferenceMs, saved ? 'yes' : 'no',
      ].map(csvField).join(','),
    )
    const blob = new Blob([[header.join(','), ...rows].join('\n')], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `saltfine_batch_classification_${Date.now()}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    showToast('Batch results exported to CSV!')
  }

  return (
    <div className="space-y-6">
      {/* Top Header Mode Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-panel p-4">
        <div>
          <h2 className="text-lg font-bold text-ink-900">Laboratory Image & Model Testing Suite</h2>
          <p className="text-sm text-ink-500">
            Upload salt photos: the trained YOLOv8 model highlights impurities (red) and salt crystals (green), then grades the sample.
          </p>
        </div>

        <div className="flex rounded-lg border border-line bg-canvas p-1">
          <button
            type="button"
            onClick={() => setActiveTab('single')}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'single' ? 'bg-navy-800 text-white shadow-sm' : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            <Upload className="size-4" /> Single Image Lab
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('bulk')}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition-colors ${
              activeTab === 'bulk' ? 'bg-navy-800 text-white shadow-sm' : 'text-ink-600 hover:text-ink-900'
            }`}
          >
            <Layers className="size-4" /> Bulk Dataset Evaluation
            {doneItems.length > 0 && (
              <span className="rounded bg-white/15 px-1.5 font-mono text-[0.7rem]">{doneItems.length}</span>
            )}
          </button>
        </div>
      </div>

      {/* Image selection: drop, browse or paste, review, then analyze */}
      <Card
        title={`Image Selection${items.length ? ` · ${items.length} / ${MAX_QUEUE_SIZE}` : ''}`}
        action={
          items.length > 0 && !running ? (
            <Button size="sm" variant="ghost" icon={Trash2} onClick={clearAll}>
              Clear all
            </Button>
          ) : undefined
        }
      >
        <div className="space-y-4">
          <ImageDropzone onFiles={addFiles} compact={items.length > 0} disabled={items.length >= MAX_QUEUE_SIZE} />

          <ImageQueue
            items={items}
            selectedId={activeTab === 'single' ? selectedItem?.id : null}
            onRemove={removeItem}
            onOpen={openInInspector}
          />

          {items.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <label className="flex cursor-pointer items-center gap-2 text-xs text-ink-700">
                <input
                  type="checkbox"
                  checked={autoSave}
                  onChange={(e) => setAutoSave(e.target.checked)}
                  disabled={running}
                  className="size-4 accent-brine-600"
                />
                Save results to Salt-Record Log
              </label>

              <div className="flex flex-wrap gap-2">
                {running ? (
                  <Button variant="secondary" icon={Square} onClick={stopAnalysis} disabled={stopping}>
                    {stopping ? 'Stopping…' : 'Stop'}
                  </Button>
                ) : (
                  failedIds.length > 0 && (
                    <Button variant="secondary" icon={RotateCcw} onClick={() => runAnalysis(failedIds)}>
                      Retry {failedIds.length} failed
                    </Button>
                  )
                )}
                <Button
                  variant="primary"
                  icon={running ? Loader2 : Play}
                  onClick={() => runAnalysis(queuedIds)}
                  disabled={running || queuedIds.length === 0}
                >
                  {running
                    ? `Analyzing ${progress.done} / ${progress.total}…`
                    : queuedIds.length === 0
                    ? 'All images analyzed'
                    : `Analyze ${queuedIds.length} image${queuedIds.length === 1 ? '' : 's'}`}
                </Button>
              </div>
            </div>
          )}

          {running && (
            <div aria-live="polite">
              <div className="flex items-center justify-between text-xs font-semibold text-ink-700">
                <span>
                  Processing images… <span className="font-mono text-brand-400">{progress.done} / {progress.total}</span>
                </span>
                <span className="flex items-center gap-2">
                  {autoSave && <span className="font-medium text-emerald-400">Auto-saving to Salt Records</span>}
                  {progressPct}%
                </span>
              </div>
              <div className="mt-2 h-2.5 overflow-hidden rounded-full border border-line bg-navy-950">
                <div className="h-full rounded-full bg-brand-500 transition-all duration-300" style={{ width: `${progressPct}%` }} />
              </div>
            </div>
          )}
        </div>
      </Card>

      {activeTab === 'single' ? (
        sample && selectedItem ? (
          <div className="grid gap-6 lg:grid-cols-12">
            {/* Left Column: CV inspection viewer */}
            <div className="space-y-6 lg:col-span-7">
              <Card
                title="Image Inspection & Vision Pipeline"
                action={
                  doneItems.length > 1 ? (
                    <div className="flex items-center gap-1">
                      <Button size="sm" variant="ghost" icon={ChevronLeft} aria-label="Previous image" onClick={() => stepInspector(-1)} disabled={selectedIndex <= 0} />
                      <span className="font-mono text-xs text-ink-500">
                        {selectedIndex + 1} / {doneItems.length}
                      </span>
                      <Button size="sm" variant="ghost" icon={ChevronRight} aria-label="Next image" onClick={() => stepInspector(1)} disabled={selectedIndex >= doneItems.length - 1} />
                    </div>
                  ) : undefined
                }
              >
                <div className="space-y-4">
                  {/* Stage Switcher */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
                    <span className="text-xs font-semibold uppercase tracking-wider text-ink-500">View</span>
                    <div className="flex gap-1.5">
                      <Button size="sm" variant={activeStage === 'original' ? 'primary' : 'secondary'} onClick={() => setActiveStage('original')}>
                        Original photo
                      </Button>
                      <Button size="sm" variant={activeStage === 'contour' ? 'primary' : 'secondary'} onClick={() => setActiveStage('contour')}>
                        YOLOv8 highlight
                      </Button>
                    </div>
                  </div>

                  {!sample.isModelResult && (
                    <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-300">
                      These numbers did not come from the YOLOv8 model ({sample.modelName}). Check that the backend is
                      running and ml_service/models/saltfine_yolov8.pt exists.
                    </div>
                  )}

                  {/* Display Viewport */}
                  <div className="relative aspect-[3/2] overflow-hidden rounded-lg border border-line bg-navy-950">
                    <InspectorImage
                      key={activeStage === 'original' ? sample.imageUrl : sample.contourUrl}
                      src={activeStage === 'original' ? sample.imageUrl : sample.contourUrl}
                      alt={`Salt sample ${sample.fileName}`}
                    />
                    <span className="absolute left-3 top-3 rounded bg-navy-900/80 px-2 py-1 font-mono text-[0.7rem] uppercase tracking-wider text-white">
                      {activeStage === 'original' ? 'Original photo' : 'Red = impurity · Green = salt'}
                    </span>
                  </div>

                  <div className="text-xs text-ink-500">
                    File: <strong className="font-mono text-ink-700">{sample.fileName}</strong> ({sample.fileSize})
                  </div>
                </div>
              </Card>
            </div>

            {/* Right Column: Classification Output */}
            <div className="space-y-6 lg:col-span-5">
              <Card title="YOLOv8 Detection & Grade">
                <div className="rounded-lg border border-line bg-canvas p-4 text-center">
                  <div className="text-xs font-bold uppercase tracking-wider text-ink-500">Predicted Quality Grade</div>
                  <div className="mt-2 flex items-center justify-center gap-3">
                    <span className="text-3xl font-extrabold text-ink-900">{sample.predictedGrade}</span>
                    <GradeBadge grade={sample.predictedGrade} />
                  </div>
                  <div className="mt-1 text-xs text-ink-500">{GRADE_META[sample.predictedGrade].range}</div>
                </div>

                <dl className="mt-4 divide-y divide-line-soft">
                  <DataRow label="Insoluble Impurities">
                    <span className={`font-mono ${impurityTone(sample.impurityPct)}`}>{sample.impurityPct.toFixed(2)}%</span>
                  </DataRow>
                  <DataRow label="Model Confidence">{formatConfidence(sample.confidence)}</DataRow>
                  <DataRow label="Inference Latency">{Math.round(sample.inferenceMs)} ms</DataRow>
                  <DataRow label="Particle Count">{formatNumber(sample.particleCount)} detected</DataRow>
                  <DataRow label="Mean Equivalent Diameter">{sample.meanEcdMm} mm</DataRow>
                  <DataRow label="GLCM Contrast (Texture)">{sample.glcmContrast}</DataRow>
                  <DataRow label="GLCM Homogeneity">{sample.glcmHomogeneity}</DataRow>
                </dl>

                <div className="mt-5 space-y-2.5 border-t border-line pt-4">
                  <div className="text-xs font-semibold uppercase tracking-wider text-ink-500">Estimated Size Fractions</div>
                  {SIZE_FRACTIONS.map(({ key, label }) => {
                    const val = sample.fractions[key] ?? 0
                    return (
                      <div key={key} className="space-y-1">
                        <div className="flex justify-between text-xs">
                          <span className="font-semibold text-ink-700">{label}</span>
                          <span className="font-mono text-ink-900">{val}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-line-soft">
                          <div className="h-full rounded-full bg-brine-600" style={{ width: `${Math.min(100, Math.max(0, val))}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="mt-6">
                  <Button
                    variant="primary"
                    className="w-full"
                    icon={CheckCircle2}
                    onClick={handleLogSampleToDb}
                    disabled={selectedItem.saved}
                  >
                    {selectedItem.saved ? 'Saved to Salt-Record Log' : 'Log Sample to Salt-Record Log'}
                  </Button>
                </div>
              </Card>
            </div>
          </div>
        ) : (
          <Card title="Classification Output">
            <div className="flex flex-col items-center justify-center py-12 text-center text-ink-400">
              <Sparkles className="size-8" />
              <p className="mt-3 text-sm font-medium text-ink-600">
                {running ? 'Analyzing…' : queuedIds.length > 0 ? 'Ready to analyze' : 'Waiting for images'}
              </p>
              <p className="mt-1 max-w-sm text-xs text-ink-400">
                {queuedIds.length > 0
                  ? `Press “Analyze” to grade the ${queuedIds.length === 1 ? 'selected image' : `${queuedIds.length} selected images`}.`
                  : 'Drop, browse or paste salt photos above. Finished images can be opened here for a detailed look.'}
              </p>
            </div>
          </Card>
        )
      ) : (
        /* Bulk results */
        <Card
          title="Bulk Dataset Evaluation & Batch Inference"
          action={
            doneItems.length > 0 ? (
              <Button size="sm" variant="secondary" icon={Download} onClick={exportBulkCsv}>
                Export Batch CSV
              </Button>
            ) : undefined
          }
        >
          {tableItems.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-line bg-canvas text-xs uppercase tracking-wider text-ink-500">
                    <th className="px-3 py-2.5">Image</th>
                    <th className="px-3 py-2.5">Predicted Grade</th>
                    <th className="px-3 py-2.5 text-right">Impurities</th>
                    <th className="px-3 py-2.5 text-right">Confidence</th>
                    <th className="px-3 py-2.5 text-right">Particles</th>
                    <th className="px-3 py-2.5 text-right">Mean ECD</th>
                    <th className="px-3 py-2.5 text-right">Fractions (F / M / C)</th>
                    <th className="px-3 py-2.5 text-right">Latency</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line-soft">
                  {tableItems.map((item) => {
                    const r = item.result
                    return (
                      <tr key={item.id} className="hover:bg-canvas/50">
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            onClick={() => r && openInInspector(item.id)}
                            disabled={!r}
                            title={r ? 'Open in Single Image Lab' : undefined}
                            className="flex items-center gap-2.5 text-left disabled:cursor-default"
                          >
                            <img
                              src={item.previewUrl || undefined}
                              alt=""
                              className="size-9 shrink-0 rounded border border-line bg-navy-950 object-cover"
                              onError={(e) => (e.currentTarget.style.visibility = 'hidden')}
                            />
                            <span className={`font-mono text-xs text-ink-900 ${r ? 'hover:underline' : ''}`}>{item.name}</span>
                          </button>
                        </td>
                        {r ? (
                          <>
                            <td className="px-3 py-2">
                              <GradeBadge grade={r.predictedGrade} />
                            </td>
                            <td className={`px-3 py-2 text-right font-mono font-semibold tabular-nums ${impurityTone(r.impurityPct)}`}>
                              {r.impurityPct.toFixed(2)}%
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums">{formatConfidence(r.confidence)}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{r.particleCount}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{r.meanEcdMm} mm</td>
                            <td className="px-3 py-2 text-right font-mono text-xs tabular-nums text-ink-600">
                              {r.fractions.fine}% / {r.fractions.medium}% / {r.fractions.coarse}%
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right text-xs tabular-nums text-ink-500">{Math.round(r.inferenceMs)} ms</td>
                          </>
                        ) : (
                          <td colSpan={7} className="px-3 py-2 text-xs">
                            {item.status === 'failed' ? (
                              <span className="text-rose-400">Failed: {item.error}</span>
                            ) : item.status === 'analyzing' ? (
                              <span className="inline-flex items-center gap-1.5 text-brand-400">
                                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> Analyzing…
                              </span>
                            ) : (
                              <span className="text-ink-400">Waiting…</span>
                            )}
                          </td>
                        )}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="py-12 text-center text-ink-400">
              <FileSpreadsheet className="mx-auto size-9 text-ink-300" />
              <p className="mt-3 text-sm font-semibold text-ink-600">No Batch Analyzed Yet</p>
              <p className="mt-1 text-xs text-ink-400">
                Drop several images above and press &ldquo;Analyze&rdquo;. Results appear here as each image finishes.
              </p>
            </div>
          )}
        </Card>
      )}
    </div>
  )
}
