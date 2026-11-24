// Report downloads. Both files are generated in the browser.

import { GRADE_META } from '../config'
import type { FilterState, FinenessGrade, SaltRecord } from '../types/saltfine'
import { describePeriod } from '../utils/filters'
import { formatBatchId, formatDate, formatDateTime, formatRecordId } from '../utils/format'
import type { SummaryResult } from '../utils/stats'

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function reportFilename({ from, to, grade }: FilterState, extension: string): string {
  const period = from || to ? `${from || 'start'}_to_${to || formatDate(new Date())}` : 'all-records'
  const gradePart = grade && grade !== 'All' ? `_${grade.toLowerCase()}` : ''
  return `salture-report_${period}${gradePart}.${extension}`
}

type ValueExtractor = (r: SaltRecord) => string | number

const CSV_COLUMNS: Array<[string, ValueExtractor]> = [
  ['record_id', (r) => formatRecordId(r.record_id)],
  ['classified_at', (r) => formatDateTime(r.classified_at)],
  ['batch_id', (r) => formatBatchId(r.batch_id)],
  ['sample_id', (r) => r.sample_code],
  ['predicted_grade', (r) => r.predicted_grade],
  ['impurity_pct', (r) => (r.impurity_pct ?? 0.12).toFixed(2)],
  ['impurity_count', (r) => r.impurity_count ?? 0],
  ['confidence_pct', (r) => (r.confidence * 100).toFixed(1)],
  ['est_fine_pct', (r) => r.est_fine_pct.toFixed(1)],
  ['est_medium_pct', (r) => r.est_medium_pct.toFixed(1)],
  ['est_coarse_pct', (r) => r.est_coarse_pct.toFixed(1)],
  ['particle_count', (r) => r.particle_count],
  ['mean_ecd_mm', (r) => r.mean_ecd_mm.toFixed(2)],
  ['median_ecd_mm', (r) => r.median_ecd_mm.toFixed(2)],
  ['container', (r) => r.container_grade],
  ['mass_g', (r) => r.mass_g.toFixed(1)],
  ['processing_time_s', (r) => r.processing_time_s.toFixed(1)],
  ['image_file', (r) => r.file_path],
]

const csvCell = (value: string | number): string => {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// One row per record in the report period. Returns the file name.
export function downloadReportCsv({ records, filters }: { records: SaltRecord[]; filters: FilterState }): string {
  const lines = [
    CSV_COLUMNS.map(([header]) => header).join(','),
    ...records.map((record) => CSV_COLUMNS.map(([, read]) => csvCell(read(record))).join(',')),
  ]
  // The BOM makes Excel open the file as UTF-8.
  const blob = new Blob(['\uFEFF', lines.join('\r\n'), '\r\n'], { type: 'text/csv;charset=utf-8' })
  const filename = reportFilename(filters, 'csv')
  downloadBlob(blob, filename)
  return filename
}

// Summary, per-grade table and the record list as an A4 PDF.
export async function downloadReportPdf({
  records,
  summary,
  filters,
  generatedAt,
}: {
  records: SaltRecord[]
  summary: SummaryResult
  filters: FilterState
  generatedAt: Date
}): Promise<string> {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 40
  const navy: [number, number, number] = [28, 42, 58]

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...navy)
  doc.text('SALTURE Classification Report', margin, 52)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(91, 104, 119)
  doc.text('Sea Salt Fineness Classification System', margin, 68)

  const gradeLabel = filters.grade && filters.grade !== 'All' ? filters.grade : 'All grades'
  doc.setTextColor(22, 32, 44)
  doc.text(`Period: ${describePeriod(filters)}`, margin, 92)
  doc.text(`Quality grade: ${gradeLabel}`, margin, 106)
  doc.text(`Generated: ${formatDateTime(generatedAt)}`, margin, 120)

  autoTable(doc, {
    startY: 138,
    margin: { left: margin, right: margin },
    theme: 'grid',
    head: [['Total batches', 'Total sorted mass', 'Average confidence', 'Avg. processing time']],
    body: [
      [
        String(summary.totalBatches),
        `${summary.totalMassKg.toFixed(2)} kg`,
        `${(summary.avgConfidence * 100).toFixed(1)} %`,
        `${summary.avgProcessingTimeS.toFixed(1)} s`,
      ],
    ],
    headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 10, cellPadding: 6 },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastY: number = (doc as any).lastAutoTable?.finalY ?? 190

  autoTable(doc, {
    startY: lastY + 20,
    margin: { left: margin, right: margin },
    theme: 'striped',
    head: [['Grade', 'Impurity range', 'Batches', 'Share', 'Sorted mass', 'Avg. conf.']],
    body: summary.perGrade.map((row) => [
      row.grade,
      GRADE_META[row.grade as FinenessGrade].range,
      String(row.batches),
      `${row.sharePct.toFixed(1)} %`,
      `${row.massKg.toFixed(2)} kg`,
      `${(row.avgConfidence * 100).toFixed(1)} %`,
    ]),
    headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
    styles: { fontSize: 9, cellPadding: 5 },
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const tableY: number = (doc as any).lastAutoTable?.finalY ?? (lastY + 140)

  // Recent record rows up to 100 in PDF
  const rows = records.slice(0, 100).map((r) => [
    formatRecordId(r.record_id),
    formatDateTime(r.classified_at),
    formatBatchId(r.batch_id),
    r.predicted_grade,
    `${(r.impurity_pct ?? 0.12).toFixed(2)} %`,
    `${(r.confidence * 100).toFixed(1)} %`,
    `${r.mass_g.toFixed(0)} g`,
    `${r.processing_time_s.toFixed(1)} s`,
  ])

  autoTable(doc, {
    startY: tableY + 20,
    margin: { left: margin, right: margin },
    theme: 'plain',
    head: [['ID', 'Timestamp', 'Batch', 'Grade', 'Impurities', 'Conf.', 'Mass', 'Latency']],
    body: rows,
    headStyles: { fillColor: [240, 244, 248], textColor: navy, fontStyle: 'bold' },
    styles: { fontSize: 8, cellPadding: 4 },
  })

  const filename = reportFilename(filters, 'pdf')
  doc.save(filename)
  return filename
}
