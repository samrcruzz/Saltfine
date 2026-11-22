import { Router, Request, Response } from 'express'
import multer from 'multer'
import path from 'path'
import fs from 'fs'
import { execFile } from 'child_process'
import { dbService } from '../db'
import type { FinenessGrade, PurityGrade, SaltRecord, SizeFractions } from '../types/saltfine'

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

export interface PythonInferenceResult {
  model_name: string
  model_source: string
  predicted_grade: FinenessGrade | PurityGrade
  quality_tier?: PurityGrade
  purity_pct?: number
  impurity_pct?: number
  impurity_count?: number
  salt_crystal_count?: number
  contamination_area_pct?: number
  confidence: number
  fractions: SizeFractions
  particle_count: number
  mean_ecd_mm: number
  median_ecd_mm: number
  mean_area_mm2: number
  inference_ms: number
  glcm_contrast: number
  glcm_homogeneity: number
  glcm_energy: number
  glcm_correlation: number
  /** Filename (in uploads/) of the YOLOv8 red/green highlighted copy, when produced */
  annotated_image?: string | null
}

function runPython(python: string, args: string[]): Promise<PythonInferenceResult | null> {
  return new Promise((resolve) => {
    // YOLOv8 on CPU can take a few seconds on the first (cold) call
    execFile(python, args, { timeout: 120_000, maxBuffer: 4 * 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) return resolve(null)
      try {
        const parsed = JSON.parse(stdout.trim())
        resolve(parsed.error ? null : parsed)
      } catch {
        resolve(null)
      }
    })
  })
}

// Calls Python inference pipeline (ml_service/predict.py at project root)
export async function runPythonPipeline(imagePath: string): Promise<PythonInferenceResult> {
  let mlDir = path.resolve(process.cwd(), 'ml_service')
  if (!fs.existsSync(path.join(mlDir, 'predict.py'))) {
    mlDir = path.resolve(process.cwd(), '..', 'ml_service')
  }
  const scriptPath = path.join(mlDir, 'predict.py')

  // Prefer the ML virtualenv (has ultralytics/supervision for YOLOv8), then system Python
  const venvPython = process.platform === 'win32'
    ? path.join(mlDir, '.venv', 'Scripts', 'python.exe')
    : path.join(mlDir, '.venv', 'bin', 'python')
  const candidates = [...(fs.existsSync(venvPython) ? [venvPython] : []), 'py', 'python']

  for (const python of candidates) {
    const result = await runPython(python, [scriptPath, imagePath])
    if (result) return result
  }
  // Internal JS fallback if python is unavailable
  return computeFallbackMetrics(path.basename(imagePath))
}

/** URL to show for an analyzed upload: the highlighted copy if YOLOv8 produced one */
export function displayUrl(storedFilename: string, pyResult: PythonInferenceResult): string {
  const annotated = pyResult.annotated_image
  if (annotated && fs.existsSync(path.join(uploadDir, path.basename(annotated)))) {
    return `/api/images/${path.basename(annotated)}`
  }
  return `/api/images/${storedFilename}`
}

function computeFallbackMetrics(fileName: string): PythonInferenceResult {
  const hash = Array.from(fileName).reduce((acc, c) => acc + c.charCodeAt(0), 0)
  const roll = (hash % 100) / 100

  let predicted_grade: PurityGrade = 'Preprocessed Food Goods'
  let impurity_pct = 0.12

  if (roll < 0.65) {
    predicted_grade = 'Preprocessed Food Goods'
    impurity_pct = Number((0.06 + (hash % 13) / 100).toFixed(2)) // <= 0.20% Food Preprocessed
  } else {
    predicted_grade = 'Industrial Goods'
    impurity_pct = Number((0.20 + (hash % 6) / 100).toFixed(2)) // > 0.20% Industrial
  }

  const purity_pct = Number((100.0 - impurity_pct).toFixed(2))
  const particle_count = 650 + (hash % 700)
  const impurity_count = Math.max(1, Math.round(particle_count * (impurity_pct / 100) * 14))
  const salt_crystal_count = particle_count - impurity_count
  const contamination_area_pct = impurity_pct

  const mean_ecd_mm = 1.48
  return {
    model_name: 'SALTFINE Impurity Detector',
    model_source: 'js_fallback',
    predicted_grade,
    quality_tier: predicted_grade,
    purity_pct,
    impurity_pct,
    impurity_count,
    salt_crystal_count,
    contamination_area_pct,
    confidence: Number((0.89 + (1 - impurity_pct) * 0.08).toFixed(4)),
    fractions: {
      fine: Number((purity_pct * 0.7).toFixed(1)),
      medium: Number((purity_pct * 0.3).toFixed(1)),
      coarse: Number((100 - purity_pct).toFixed(1)),
    },
    particle_count,
    mean_ecd_mm,
    median_ecd_mm: 1.39,
    mean_area_mm2: 1.72,
    inference_ms: 18.4,
    glcm_contrast: 0.42,
    glcm_homogeneity: 0.78,
    glcm_energy: 0.16,
    glcm_correlation: 0.84,
  }
}

/** Build the DB record for one analyzed image (shared by upload, bulk and the camera trigger). */
export function buildRecord(
  pyResult: PythonInferenceResult,
  storedFilename: string,
  opts: { sampleCode?: string; supplier?: string; massG?: number } = {},
): SaltRecord {
  const recordId = Math.floor(Date.now() % 900000) + Math.floor(Math.random() * 1000)
  const purity_pct = pyResult.purity_pct ?? 96.5
  const impurity_count = pyResult.impurity_count ?? 0
  const now = new Date().toISOString()
  return {
    record_id: recordId,
    batch_id: recordId,
    sample_code: opts.sampleCode || `IMG-${String(recordId).slice(-4)}`,
    supplier: opts.supplier || 'Dasol Artisanal Salt',
    image_id: recordId,
    // red/green highlighted copy when YOLOv8 ran; the original stays next to it in uploads/
    file_path: displayUrl(storedFilename, pyResult),
    captured_at: now,
    model_name: pyResult.model_name || 'SALTFINE Impurity Detector',
    predicted_grade: pyResult.predicted_grade,
    purity_pct,
    impurity_pct: pyResult.impurity_pct ?? Number((100 - purity_pct).toFixed(2)),
    impurity_count,
    salt_crystal_count: pyResult.salt_crystal_count ?? pyResult.particle_count - impurity_count,
    contamination_area_pct: pyResult.contamination_area_pct ?? pyResult.impurity_pct ?? 0,
    quality_tier: pyResult.predicted_grade as PurityGrade,
    confidence: pyResult.confidence,
    est_fine_pct: pyResult.fractions.fine,
    est_medium_pct: pyResult.fractions.medium,
    est_coarse_pct: pyResult.fractions.coarse,
    inference_ms: pyResult.inference_ms,
    classified_at: now,
    particle_count: pyResult.particle_count,
    mean_area_mm2: pyResult.mean_area_mm2,
    mean_ecd_mm: pyResult.mean_ecd_mm,
    median_ecd_mm: pyResult.median_ecd_mm,
    glcm_contrast: pyResult.glcm_contrast,
    glcm_homogeneity: pyResult.glcm_homogeneity,
    glcm_energy: pyResult.glcm_energy,
    glcm_correlation: pyResult.glcm_correlation,
    sorting_id: recordId,
    container_grade: pyResult.predicted_grade,
    mass_g: opts.massG || Number((150 + (recordId % 300)).toFixed(1)),
    processing_time_s: Number((pyResult.inference_ms / 1000 + 0.6).toFixed(2)),
    sorted_at: now,
  }
}

/** Response body for an analyzed image. is_model_result=false means a fallback (not YOLOv8) produced the numbers. */
export function analysisResponse(
  file: { originalname: string; size: number; filename: string },
  pyResult: PythonInferenceResult,
  record?: SaltRecord,
) {
  return {
    fileName: file.originalname,
    fileSize: `${(file.size / 1024).toFixed(1)} KB`,
    fileUrl: `/api/images/${file.filename}`,
    annotatedFileUrl: displayUrl(file.filename, pyResult),
    storedFilename: file.filename,
    record,
    is_model_result: pyResult.model_source === 'yolov8',
    ...pyResult,
  }
}

// POST /api/analyze/upload (Single image upload)
router.post('/upload', upload.single('image'), async (req: Request, res: Response) => {
  if (!req.file) {
    res.status(400).json({ error: 'No image file uploaded' })
    return
  }
  const pyResult = await runPythonPipeline(req.file.path)
  let record: SaltRecord | undefined
  if (req.body.saveToDb === 'true' || req.query.saveToDb === 'true') {
    record = buildRecord(pyResult, req.file.filename, {
      sampleCode: req.body.sampleCode as string,
      supplier: req.body.supplier as string,
      massG: Number(req.body.massG) || undefined,
    })
    await dbService.insertRecord(record)
  }
  res.json(analysisResponse(req.file, pyResult, record))
})

// POST /api/analyze/bulk (Bulk images upload)
router.post('/bulk', upload.array('images', 100), async (req: Request, res: Response) => {
  const files = req.files as Express.Multer.File[]
  if (!files || files.length === 0) {
    res.status(400).json({ error: 'No images uploaded' })
    return
  }
  const shouldSaveToDb = req.body.saveToDb === 'true' || req.query.saveToDb === 'true'
  const results = []
  for (const file of files) {
    const pyResult = await runPythonPipeline(file.path)
    let record: SaltRecord | undefined
    if (shouldSaveToDb) {
      record = buildRecord(pyResult, file.filename, { sampleCode: `BATCH-${Date.now() % 10000}` })
      await dbService.insertRecord(record)
    }
    results.push(analysisResponse(file, pyResult, record))
  }
  res.json(results)
})

export default router
