import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { execFile } from 'child_process'
import { dbService } from '../db'
import type { PurityGrade, SaltRecord } from '../types/saltfine'

const router = Router()

// Ensure uploads directory exists inside backend
export const uploadDir = path.resolve(process.cwd(), 'uploads')
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true })
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir)
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname)
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_')
    cb(null, `SALT_${Date.now()}_${base}${ext}`)
  },
})

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
})

/** Thesis batch size: each photographed batch is 100 g of salt unless the operator enters another mass. */
export const DEFAULT_BATCH_MASS_G = 100

/** What ml_service/predict.py prints for one photo. Every number is measured on that photo. */
export interface PythonInferenceResult {
  model_name: string
  /** always 'yolov8': predict.py has no fallback */
  model_source: string
  predicted_grade: PurityGrade
  quality_tier: PurityGrade
  purity_pct: number
  impurity_pct: number
  impurity_count: number
  salt_crystal_count: number
  particle_count: number
  contamination_area_pct: number
  confidence: number
  /** YOLOv8 predict() time on this photo (ms), measured in predict.py */
  inference_ms: number
  /** Everything predict.py did: imports, model load, prediction, drawing the highlight (ms) */
  analysis_ms: number
  /** Filename (in uploads/) of the YOLOv8 red/green highlighted copy */
  annotated_image: string
}

/** A measured analysis: the model output plus the backend's own wall-clock time for it. */
export interface PipelineResult {
  py: PythonInferenceResult
  /** wall-clock time of the predict.py run that produced the result (start to parsed JSON), in seconds */
  processingTimeS: number
}

/** The model could not grade the photo. Nothing must be saved or shown as a result. */
export class AnalysisError extends Error {}

const REQUIRED_NUMBERS: (keyof PythonInferenceResult)[] = [
  'purity_pct',
  'impurity_pct',
  'impurity_count',
  'salt_crystal_count',
  'particle_count',
  'contamination_area_pct',
  'confidence',
  'inference_ms',
  'analysis_ms',
]

/** Rejects anything that is not a complete YOLOv8 result, so no field has to be filled in with a guess. */
function validateResult(parsed: Record<string, unknown>): string | null {
  if (parsed.model_source !== 'yolov8') return `unexpected model_source ${JSON.stringify(parsed.model_source)}`
  if (parsed.predicted_grade !== 'Preprocessed Food Goods' && parsed.predicted_grade !== 'Industrial Goods') {
    return `unexpected predicted_grade ${JSON.stringify(parsed.predicted_grade)}`
  }
  for (const key of REQUIRED_NUMBERS) {
    if (typeof parsed[key] !== 'number' || !Number.isFinite(parsed[key])) return `missing or invalid ${key}`
  }
  if (typeof parsed.annotated_image !== 'string' || !parsed.annotated_image) return 'missing annotated_image'
  return null
}

// predict.py exit code when the photo itself cannot be graded (unreadable, nothing detected)
const EXIT_ANALYSIS_FAILED = 3

/** imageProblem = predict.py ran fine but cannot grade this photo, so another interpreter will not help */
type Attempt = { ok: true; result: PipelineResult } | { ok: false; error: string; imageProblem: boolean }

function runPython(python: string, args: string[]): Promise<Attempt> {
  return new Promise((resolve) => {
    const started = performance.now()
    // YOLOv8 on CPU can take a few seconds on the first (cold) call
    execFile(python, args, { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout, stderr) => {
      const elapsedS = (performance.now() - started) / 1000
      let parsed: Record<string, unknown> | null = null
      try {
        parsed = stdout ? JSON.parse(stdout.trim()) : null
      } catch {
        parsed = null
      }
      // predict.py prints {"error": "..."} and exits non-zero when it cannot grade the photo
      if (parsed && typeof parsed.error === 'string') {
        const exitCode = (err as { code?: unknown } | null)?.code
        resolve({ ok: false, error: parsed.error, imageProblem: exitCode === EXIT_ANALYSIS_FAILED })
        return
      }
      if (err) {
        const notFound = (err as NodeJS.ErrnoException).code === 'ENOENT'
        const detail = String(stderr || err.message).trim().split(/\r?\n/).slice(-1)[0]
        resolve({ ok: false, error: notFound ? `${python} not found` : `${python} failed: ${detail}`, imageProblem: false })
        return
      }
      if (!parsed) {
        resolve({ ok: false, error: `${python} printed no JSON result`, imageProblem: false })
        return
      }
      const problem = validateResult(parsed)
      if (problem) {
        resolve({ ok: false, error: `predict.py returned an incomplete result (${problem})`, imageProblem: false })
        return
      }
      resolve({
        ok: true,
        result: { py: parsed as unknown as PythonInferenceResult, processingTimeS: Number(elapsedS.toFixed(3)) },
      })
    })
  })
}

/**
 * Runs the YOLOv8 pipeline (ml_service/predict.py) on one photo.
 * Throws AnalysisError when no Python interpreter can run it or the model cannot grade the photo:
 * there is no fallback, so a failed analysis never turns into a made-up result.
 */
export async function runPythonPipeline(imagePath: string): Promise<PipelineResult> {
  let mlDir = path.resolve(process.cwd(), 'ml_service')
  if (!fs.existsSync(path.join(mlDir, 'predict.py'))) {
    mlDir = path.resolve(process.cwd(), '..', 'ml_service')
  }
  const scriptPath = path.join(mlDir, 'predict.py')
  if (!fs.existsSync(scriptPath)) {
    throw new AnalysisError(`ml_service/predict.py not found (looked in ${mlDir})`)
  }

  // Prefer the ML virtualenv (has ultralytics/supervision for YOLOv8), then system Python
  const venvPython = process.platform === 'win32'
    ? path.join(mlDir, '.venv', 'Scripts', 'python.exe')
    : path.join(mlDir, '.venv', 'bin', 'python')
  const candidates = [...(fs.existsSync(venvPython) ? [venvPython] : []), 'py', 'python']

  const errors: string[] = []
  for (const python of candidates) {
    const attempt = await runPython(python, [scriptPath, imagePath])
    if (attempt.ok) return attempt.result
    errors.push(attempt.error)
    if (attempt.imageProblem) break
  }
  throw new AnalysisError(errors[0] + (errors.length > 1 ? ` (also tried: ${errors.slice(1).join('; ')})` : ''))
}

/**
 * Batch mass entered by the operator (massG or mass_g, in grams), or the 100 g thesis batch size when none is given.
 * Returns an error message for a value that is present but not a positive number, so a typo is never recorded.
 */
export function parseMassG(...values: unknown[]): { massG: number } | { error: string } {
  const given = values.find((v) => v !== undefined && v !== null && String(v).trim() !== '')
  if (given === undefined) return { massG: DEFAULT_BATCH_MASS_G }
  const massG = Number(given)
  if (!Number.isFinite(massG) || massG <= 0 || massG > 100_000) {
    return { error: `Invalid batch mass ${JSON.stringify(given)}: enter the weighed mass in grams (default ${DEFAULT_BATCH_MASS_G} g).` }
  }
  return { massG }
}

/** URL to show for an analyzed upload: the highlighted copy YOLOv8 produced */
export function displayUrl(storedFilename: string, pyResult: PythonInferenceResult): string {
  const annotated = pyResult.annotated_image
  if (annotated && fs.existsSync(path.join(uploadDir, path.basename(annotated)))) {
    return `/api/images/${path.basename(annotated)}`
  }
  return `/api/images/${storedFilename}`
}

/** Build the DB record for one analyzed image (shared by upload, bulk and the camera trigger). */
export function buildRecord(
  result: PipelineResult,
  storedFilename: string,
  opts: { sampleCode?: string; supplier?: string; massG: number },
): SaltRecord {
  const { py } = result
  const recordId = Math.floor(Date.now() % 900000) + Math.floor(Math.random() * 1000)
  const now = new Date().toISOString()
  return {
    record_id: recordId,
    batch_id: recordId,
    sample_code: opts.sampleCode || `IMG-${String(recordId).slice(-4)}`,
    supplier: opts.supplier || 'Dasol Artisanal Salt',
    image_id: recordId,
    // red/green highlighted copy when YOLOv8 ran; the original stays next to it in uploads/
    file_path: displayUrl(storedFilename, py),
    captured_at: now,
    model_name: py.model_name,
    predicted_grade: py.predicted_grade,
    purity_pct: py.purity_pct,
    impurity_pct: py.impurity_pct,
    impurity_count: py.impurity_count,
    salt_crystal_count: py.salt_crystal_count,
    contamination_area_pct: py.contamination_area_pct,
    quality_tier: py.quality_tier,
    confidence: py.confidence,
    inference_ms: py.inference_ms,
    classified_at: now,
    particle_count: py.particle_count,
    sorting_id: recordId,
    container_grade: py.predicted_grade,
    mass_g: opts.massG,
    processing_time_s: Number(result.processingTimeS.toFixed(2)),
    sorted_at: now,
  }
}

/** Response body for an analyzed image. */
export function analysisResponse(
  file: { originalname: string; size: number; filename: string },
  result: PipelineResult,
  record?: SaltRecord,
) {
  return {
    fileName: file.originalname,
    fileSize: `${(file.size / 1024).toFixed(1)} KB`,
    fileUrl: `/api/images/${file.filename}`,
    annotatedFileUrl: displayUrl(file.filename, result.py),
    storedFilename: file.filename,
    record,
    is_model_result: true,
    ...result.py,
    processing_time_s: Number(result.processingTimeS.toFixed(2)),
  }
}

/** HTTP body for a photo the model could not grade. No record is saved. */
function analysisFailure(fileName: string, error: unknown) {
  const reason = error instanceof Error ? error.message : String(error)
  return { fileName, error: `Image analysis failed for ${fileName}: ${reason}. No result was recorded.` }
}

// POST /api/analyze/upload (Single image upload). Fields: image, saveToDb, sampleCode, supplier, massG
router.post('/upload', upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No image file uploaded' })
    return
  }
  const mass = parseMassG(req.body.massG, req.body.mass_g, req.query.massG)
  if ('error' in mass) {
    res.status(400).json({ error: mass.error })
    return
  }
  let result: PipelineResult
  try {
    result = await runPythonPipeline(req.file.path)
  } catch (error) {
    res.status(error instanceof AnalysisError ? 503 : 500).json(analysisFailure(req.file.originalname, error))
    return
  }
  let record: SaltRecord | undefined
  if (req.body.saveToDb === 'true' || req.query.saveToDb === 'true') {
    record = buildRecord(result, req.file.filename, {
      sampleCode: req.body.sampleCode as string,
      supplier: req.body.supplier as string,
      massG: mass.massG,
    })
    await dbService.insertRecord(record)
  }
  res.json(analysisResponse(req.file, result, record))
})

// POST /api/analyze/bulk (Bulk images upload). Fields: images[], saveToDb, massG (same mass for every image)
// Each entry is an analysis, or { fileName, error } for a photo the model could not grade (nothing saved for it).
router.post('/bulk', upload.array('images', 100), async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[]
  if (!files || files.length === 0) {
    res.status(400).json({ error: 'No images uploaded' })
    return
  }
  const mass = parseMassG(req.body.massG, req.body.mass_g, req.query.massG)
  if ('error' in mass) {
    res.status(400).json({ error: mass.error })
    return
  }
  const shouldSaveToDb = req.body.saveToDb === 'true' || req.query.saveToDb === 'true'
  const results = []
  let failed = 0
  for (const file of files) {
    let result: PipelineResult
    try {
      result = await runPythonPipeline(file.path)
    } catch (error) {
      failed++
      results.push(analysisFailure(file.originalname, error))
      continue
    }
    let record: SaltRecord | undefined
    if (shouldSaveToDb) {
      record = buildRecord(result, file.filename, { sampleCode: `BATCH-${Date.now() % 10000}`, massG: mass.massG })
      await dbService.insertRecord(record)
    }
    results.push(analysisResponse(file, result, record))
  }
  if (failed === files.length) {
    res.status(503).json({ error: `Image analysis failed for all ${failed} images. No results were recorded.`, results })
    return
  }
  res.json(results)
})

export default router
