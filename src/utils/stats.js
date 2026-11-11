import { GRADES } from '../config.js'
import { gramsToKg } from './format.js'

const average = (sum, count) => (count ? sum / count : 0)

// Builds the Reports summary from a list of records.
// Batches are counted by predicted grade; mass is totalled by the container
// the salt was actually routed to (sorting_records.container_grade).
export function summarize(records) {
  const groups = Object.fromEntries(
    GRADES.map((grade) => [grade, { batches: 0, massG: 0, confidence: 0, time: 0 }]),
  )

  let massG = 0
  let confidence = 0
  let time = 0
  let minConfidence = Infinity
  let minTime = Infinity
  let maxTime = -Infinity

  for (const record of records) {
    const predicted = groups[record.predicted_grade]
    predicted.batches += 1
    predicted.confidence += record.confidence
    predicted.time += record.processing_time_s
    groups[record.container_grade].massG += record.mass_g

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
