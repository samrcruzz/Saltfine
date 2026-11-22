import { GRADES } from '../config'
import type { FinenessGrade, SaltRecord } from '../types/saltfine'
import { gramsToKg } from './format'

const average = (sum: number, count: number): number => (count ? sum / count : 0)

export interface GradeStatSummary {
  grade: FinenessGrade
  batches: number
  sharePct: number
  massKg: number
  avgConfidence: number
  avgProcessingTimeS: number
  [key: string]: unknown
}

export interface SummaryResult {
  totalBatches: number
  totalMassKg: number
  avgMassG: number
  avgConfidence: number
  minConfidence: number
  avgProcessingTimeS: number
  minProcessingTimeS: number
  maxProcessingTimeS: number
  perGrade: GradeStatSummary[]
}

// Builds the Reports summary from a list of records.
export function summarize(records: SaltRecord[]): SummaryResult {
  const groups: Record<string, { batches: number; massG: number; confidence: number; time: number }> = {
    'Preprocessed Food Goods': { batches: 0, massG: 0, confidence: 0, time: 0 },
    'Industrial Goods': { batches: 0, massG: 0, confidence: 0, time: 0 },
    Fine: { batches: 0, massG: 0, confidence: 0, time: 0 },
    Medium: { batches: 0, massG: 0, confidence: 0, time: 0 },
    Coarse: { batches: 0, massG: 0, confidence: 0, time: 0 },
  }

  let massG = 0
  let confidence = 0
  let time = 0
  let minConfidence = Infinity
  let minTime = Infinity
  let maxTime = -Infinity

  for (const record of records) {
    const predicted = groups[record.predicted_grade]
    if (predicted) {
      predicted.batches += 1
      predicted.confidence += record.confidence
      predicted.time += record.processing_time_s
    }

    const containerGrade = record.container_grade as FinenessGrade
    if (groups[containerGrade]) {
      groups[containerGrade].massG += record.mass_g
    }

    massG += record.mass_g
    confidence += record.confidence
    time += record.processing_time_s
    minConfidence = Math.min(minConfidence, record.confidence)
    minTime = Math.min(minTime, record.processing_time_s)
    maxTime = Math.max(maxTime, record.processing_time_s)
  }

  const total = records.length

  return {
    totalBatches: total,
    totalMassKg: gramsToKg(massG),
    avgMassG: average(massG, total),
    avgConfidence: average(confidence, total),
    minConfidence: total ? minConfidence : 0,
    avgProcessingTimeS: average(time, total),
    minProcessingTimeS: total ? minTime : 0,
    maxProcessingTimeS: total ? maxTime : 0,
    perGrade: GRADES.map((grade) => {
      const group = groups[grade]
      return {
        grade,
        batches: group.batches,
        sharePct: total ? (group.batches / total) * 100 : 0,
        massKg: gramsToKg(group.massG),
        avgConfidence: average(group.confidence, group.batches),
        avgProcessingTimeS: average(group.time, group.batches),
      }
    }),
  }
}
