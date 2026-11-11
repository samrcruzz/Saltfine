// Synthetic record generator for mock mode.
//
// Each record is the "joined" row the backend is expected to return for one
// sorting cycle. Field names follow the SQLite schema in the manuscript
// (Figure 2.4), so swapping to the real API needs no renaming:
//
//   batches           batch_id, sample_code, supplier
//   images            image_id, file_path, captured_at
//   classifications   record_id (= classification_id), model_name,
//                     predicted_grade, confidence (0–1), est_fine_pct,
//                     est_medium_pct, est_coarse_pct, inference_ms, classified_at
//   particle_features particle_count, mean_area_mm2, mean_ecd_mm, median_ecd_mm,
//                     glcm_contrast, glcm_homogeneity, glcm_energy, glcm_correlation
//   sorting_records   sorting_id, container_grade, mass_g, processing_time_s, sorted_at
//
// All values are made up for demonstration. They are not measurements.

import { mulberry32 } from '../utils/random.js'

export const MODEL_NAME = 'MobileNetV2'

const SUPPLIERS = ['Dasol Supplier A', 'Dasol Supplier B', 'Dasol Supplier C']

// Share of batches per grade in the mock data set.
const GRADE_WEIGHTS = [
  ['Medium', 0.42],
  ['Fine', 0.33],
  ['Coarse', 0.25],
]

// Typical projected area (mm²) and equivalent-circle diameter (mm) of one
// particle in each class. Also used by the simulated image renderer.
export const CLASS_AREA_MM2 = { Fine: 0.264, Medium: 1.674, Coarse: 6.38 }
const CLASS_ECD_MM = { Fine: 0.58, Medium: 1.46, Coarse: 2.85 }

// Plate area covered by salt inside one camera frame (mm²).
const COVERED_AREA_MM2 = 528

const round = (value, digits = 1) => Number(value.toFixed(digits))
const pad = (value, length = 4) => String(value).padStart(length, '0')
const clamp = (value, min, max) => Math.min(max, Math.max(min, value))

function pickGrade(rand) {
  let roll = rand()
  for (const [grade, weight] of GRADE_WEIGHTS) {
    roll -= weight
    if (roll < 0) return grade
  }
  return 'Medium'
}

// Estimated size fractions (%). The predicted grade is the dominant fraction.
function makeFractions(grade, rand) {
  const dominant = 56 + Math.pow(rand(), 1.3) * 34
  const rest = 100 - dominant
  let fine
  let medium

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

// Returns makeRecord(classifiedAt: Date) -> record. IDs increase by one per call.
export function createRecordFactory(seed = 457) {
  const rand = mulberry32(seed)
  let nextId = 1
  let sampleNumber = 0
  let sample = null
  let batchesLeftInSample = 0

  return function makeRecord(classifiedAt) {
    // One physical sample from a supplier is processed as several batches.
    if (batchesLeftInSample === 0) {
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

    const grade = pickGrade(rand)
    const { fine, medium, coarse } = makeFractions(grade, rand)
    const dominant = Math.max(fine, medium, coarse) / 100
    const confidence = clamp(0.62 + (dominant - 0.5) * 0.85 + (rand() - 0.5) * 0.06, 0.6, 0.995)

    const covered = COVERED_AREA_MM2 * (0.85 + rand() * 0.3)
    const particleCount = Math.round(
      ((fine / CLASS_AREA_MM2.Fine + medium / CLASS_AREA_MM2.Medium + coarse / CLASS_AREA_MM2.Coarse) *
        covered) /
        100,
    )

    const meanEcd =
      ((fine * CLASS_ECD_MM.Fine + medium * CLASS_ECD_MM.Medium + coarse * CLASS_ECD_MM.Coarse) / 100) *
      (0.97 + rand() * 0.06)
    const medianEcd = meanEcd * (0.9 + rand() * 0.07)
    const meanArea = (Math.PI / 4) * meanEcd ** 2 * (1.02 + rand() * 0.1)

    // 0 (all fine) .. 1 (all coarse); drives the texture features.
    const coarseness = (medium * 0.5 + coarse) / 100

    const massG = 180 + rand() * 340
    const processingTimeS = 11 + massG * 0.018 + rand() * 3

    const at = classifiedAt.getTime()

    return {
      // classifications
      record_id: id,
      model_name: MODEL_NAME,
      predicted_grade: grade,
      confidence: round(confidence, 4),
      est_fine_pct: fine,
      est_medium_pct: medium,
      est_coarse_pct: coarse,
      inference_ms: round(21 + rand() * 24, 1),
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
export function seedHistory(makeRecord, { now = new Date(), days = 21, seed = 2026 } = {}) {
  const rand = mulberry32(seed)
  const times = []

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

  times.sort((a, b) => a - b)
  return times.map(makeRecord)
}
