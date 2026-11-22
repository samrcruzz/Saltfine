// Synthetic record generator for mock mode.

import type { FinenessGrade, PurityGrade, SaltRecord, SizeFractions } from '../types/saltfine'
import { mulberry32 } from '../utils/random'

export const MODEL_NAME = 'SALTFINE Impurity Detector'

const SUPPLIERS = ['Dasol Supplier A', 'Dasol Supplier B', 'Dasol Supplier C']

// Share of batches per purity tier in the mock data set.
const PURITY_WEIGHTS: Array<[PurityGrade, number]> = [
  ['Preprocessed Food Goods', 0.65],
  ['Industrial Goods', 0.35],
]

// Typical projected area (mm²) and equivalent-circle diameter (mm) of one
// particle in each class. Also used by the simulated image renderer.
export const CLASS_AREA_MM2: Record<string, number> = { Fine: 0.264, Medium: 1.674, Coarse: 6.38 }
const CLASS_ECD_MM: Record<string, number> = { Fine: 0.58, Medium: 1.46, Coarse: 2.85 }

// Plate area covered by salt inside one camera frame (mm²).
const COVERED_AREA_MM2 = 528

const round = (value: number, digits = 1): number => Number(value.toFixed(digits))
const pad = (value: number | string, length = 4): string => String(value).padStart(length, '0')
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

function pickGrade(rand: () => number): PurityGrade {
  let roll = rand()
  for (const [grade, weight] of PURITY_WEIGHTS) {
    roll -= weight
    if (roll < 0) return grade
  }
  return 'Preprocessed Food Goods'
}

// Estimated size fractions (%). The predicted grade is the dominant fraction.
function makeFractions(grade: FinenessGrade, rand: () => number): SizeFractions {
  const dominant = 56 + Math.pow(rand(), 1.3) * 34
  const rest = 100 - dominant
  let fine: number
  let medium: number

  if (grade === 'Fine') {
    fine = dominant
    medium = rest * (0.65 + rand() * 0.25)
  } else if (grade === 'Coarse') {
    medium = rest * (0.65 + rand() * 0.25)
    fine = rest - medium
  } else {
    medium = dominant
    fine = rest * (0.3 + rand() * 0.4)
  }

  fine = round(fine)
  medium = round(medium)
  return { fine, medium, coarse: round(100 - fine - medium) }
}

export type RecordFactory = (classifiedAt: Date) => SaltRecord

// Returns makeRecord(classifiedAt: Date) -> record. IDs increase by one per call.
export function createRecordFactory(seed = 457): RecordFactory {
  const rand = mulberry32(seed)
  let nextId = 1
  let sampleNumber = 0
  let sample: { sample_code: string; supplier: string } | null = null
  let batchesLeftInSample = 0

  return function makeRecord(classifiedAt: Date): SaltRecord {
    // One physical sample from a supplier is processed as several batches.
    if (batchesLeftInSample === 0 || !sample) {
      sampleNumber += 1
      sample = {
        sample_code: `S-${pad(sampleNumber)}`,
        supplier: SUPPLIERS[Math.floor(rand() * SUPPLIERS.length)],
      }
      batchesLeftInSample = 3 + Math.floor(rand() * 4)
    }
    batchesLeftInSample -= 1

    const id = nextId
    nextId += 1

    const roll = rand()
    let grade: PurityGrade = 'Preprocessed Food Goods'
    let impurityPct = 0.12

    if (roll < 0.65) {
      grade = 'Preprocessed Food Goods'
      impurityPct = round(0.06 + rand() * 0.13, 2) // <= 0.20% Food Preprocessed
    } else {
      grade = 'Industrial Goods'
      impurityPct = round(0.20 + rand() * 0.05, 2) // > 0.20% Industrial
    }
    const purityPct = round(100 - impurityPct, 2)

    const { fine, medium, coarse } = makeFractions('Medium', rand)
    const confidence = clamp(0.88 + (1 - impurityPct) * 0.08 + (rand() - 0.5) * 0.03, 0.82, 0.995)

    const covered = COVERED_AREA_MM2 * (0.85 + rand() * 0.3)
    const particleCount = Math.round(550 + rand() * 950)
    const impurityCount = Math.max(1, Math.round(particleCount * (impurityPct / 100) * 14))
    const saltCrystalCount = particleCount - impurityCount
    const contaminationAreaPct = impurityPct

    const meanEcd = 1.48 * (0.97 + rand() * 0.06)
    const medianEcd = meanEcd * (0.9 + rand() * 0.07)
    const meanArea = (Math.PI / 4) * meanEcd ** 2 * (1.02 + rand() * 0.1)

    const coarseness = 0.45

    const massG = 180 + rand() * 340
    const processingTimeS = 11 + massG * 0.018 + rand() * 3

    const at = classifiedAt.getTime()

    return {
      // classifications
      record_id: id,
      model_name: MODEL_NAME,
      predicted_grade: grade,
      purity_pct: purityPct,
      impurity_pct: impurityPct,
      impurity_count: impurityCount,
      salt_crystal_count: saltCrystalCount,
      contamination_area_pct: contaminationAreaPct,
      quality_tier: grade,
      confidence: round(confidence, 4),
      est_fine_pct: fine,
      est_medium_pct: medium,
      est_coarse_pct: coarse,
      inference_ms: round(14 + rand() * 12, 1),
      classified_at: new Date(at).toISOString(),

      // batches
      batch_id: id,
      sample_code: sample.sample_code,
      supplier: sample.supplier,

      // images (only the path is stored; the file lives on the device)
      image_id: id,
      file_path: `/images/${sample.sample_code}/IMG-${pad(id)}.jpg`,
      captured_at: new Date(at - Math.round(600 + rand() * 800)).toISOString(),

      // particle_features
      particle_count: particleCount,
      mean_area_mm2: round(meanArea, 3),
      mean_ecd_mm: round(meanEcd, 2),
      median_ecd_mm: round(medianEcd, 2),
      glcm_contrast: round(0.18 + coarseness * 0.62 + rand() * 0.08, 3),
      glcm_homogeneity: round(0.9 - coarseness * 0.3 - rand() * 0.05, 3),
      glcm_energy: round(0.3 - coarseness * 0.18 - rand() * 0.03, 3),
      glcm_correlation: round(0.78 + coarseness * 0.15 + rand() * 0.04, 3),

      // sorting_records (salt is routed to the bin of the predicted grade)
      sorting_id: id,
      container_grade: grade,
      mass_g: round(massG),
      processing_time_s: round(processingTimeS),
      sorted_at: new Date(at + Math.round(3000 + rand() * 3000)).toISOString(),
    }
  }
}

// Builds a history of past cycles: 5–9 batches per working day (no Sundays),
// between 08:30 and 16:30, for the last `days` days up to `now`.
export function seedHistory(
  makeRecord: RecordFactory,
  { now = new Date(), days = 21, seed = 2026 }: { now?: Date; days?: number; seed?: number } = {},
): SaltRecord[] {
  const rand = mulberry32(seed)
  const times: Date[] = []

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(now.getFullYear(), now.getMonth(), now.getDate() - offset)
    if (day.getDay() === 0) continue

    const runs = 5 + Math.floor(rand() * 5)
    for (let i = 0; i < runs; i += 1) {
      const minutesIntoDay = 8 * 60 + 30 + rand() * 8 * 60
      const at = new Date(day.getTime() + minutesIntoDay * 60_000)
      if (at.getTime() < now.getTime() - 60_000) times.push(at)
    }
  }

  times.sort((a, b) => a.getTime() - b.getTime())
  return times.map(makeRecord)
}
