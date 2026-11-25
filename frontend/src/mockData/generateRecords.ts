// Synthetic record generator for demo / mock mode. NOTHING here is measured: every record is simulated,
// carries is_demo: true and is labelled as demo data in the dashboard. Real records only come from
// photos analyzed by the YOLOv8 model (backend/src/routes/analyze.ts).

import type { PurityGrade, SaltRecord } from '../types/saltfine'
import { mulberry32 } from '../utils/random'

export const MODEL_NAME = 'Simulated demo data (not the model)'

const SUPPLIERS = ['Dasol Supplier A', 'Dasol Supplier B', 'Dasol Supplier C']

// Share of batches per grade in the mock data set.
const PURITY_WEIGHTS: Array<[PurityGrade, number]> = [
  ['Preprocessed Food Goods', 0.65],
  ['Industrial Goods', 0.35],
]

// Typical projected area (mm²) of one crystal per size class, for the simulated image renderer only.
export const CLASS_AREA_MM2: Record<string, number> = { Fine: 0.264, Medium: 1.674, Coarse: 6.38 }

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

    const confidence = clamp(0.88 + (1 - impurityPct) * 0.08 + (rand() - 0.5) * 0.03, 0.82, 0.995)

    const particleCount = Math.round(550 + rand() * 950)
    const impurityCount = Math.max(1, Math.round(particleCount * (impurityPct / 100) * 14))
    const saltCrystalCount = particleCount - impurityCount
    const contaminationAreaPct = impurityPct

    // around the 100 g thesis batch size
    const massG = 100 + (rand() - 0.5) * 6
    const processingTimeS = 2 + rand() * 2

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

      // sorting_records (salt is routed to the bin of the predicted grade)
      sorting_id: id,
      container_grade: grade,
      mass_g: round(massG),
      processing_time_s: round(processingTimeS),
      sorted_at: new Date(at + Math.round(3000 + rand() * 3000)).toISOString(),

      is_demo: true,
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
