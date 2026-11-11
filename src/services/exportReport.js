// Report downloads. Both files are generated in the browser from the records
// already loaded for the report, so they work in mock mode and with the API.

import { GRADE_META } from '../config.js'
import { describePeriod } from '../utils/filters.js'
import { formatBatchId, formatDate, formatDateTime, formatRecordId } from '../utils/format.js'

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function reportFilename({ from, to, grade }, extension) {
  const period = from || to ? `${from || 'start'}_to_${to || formatDate(new Date())}` : 'all-records'
  const gradePart = grade && grade !== 'All' ? `_${grade.toLowerCase()}` : ''
  return `saltfine-report_${period}${gradePart}.${extension}`
}

const CSV_COLUMNS = [
  ['record_id', (r) => formatRecordId(r.record_id)],
  ['classified_at', (r) => formatDateTime(r.classified_at)],
  ['batch_id', (r) => formatBatchId(r.batch_id)],
  ['sample_id', (r) => r.sample_code],
  ['predicted_grade', (r) => r.predicted_grade],
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

const csvCell = (value) => {
  const text = String(value)
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

// One row per record in the report period. Returns the file name.
export function downloadReportCsv({ records, filters }) {
  const lines = [
    CSV_COLUMNS.map(([header]) => header).join(','),
    ...records.map((record) => CSV_COLUMNS.map(([, read]) => csvCell(read(record))).join(',')),
  ]
  // The BOM makes Excel open the file as UTF-8.
  const blob = new Blob(['﻿', lines.join('\r\n'), '\r\n'], { type: 'text/csv;charset=utf-8' })
  const filename = reportFilename(filters, 'csv')
  downloadBlob(blob, filename)
  return filename
}

// Summary, per-grade table and the record list as an A4 PDF. The PDF library
// is loaded only when this is called, so it does not slow the first page load.
export async function downloadReportPdf({ records, summary, filters, generatedAt }) {
  const [{ jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ])

  const doc = new jsPDF({ unit: 'pt', format: 'a4' })
  const margin = 40
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const navy = [28, 42, 58]

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(18)
  doc.setTextColor(...navy)
  doc.text('SALTFINE Classification Report', margin, 52)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(10)
  doc.setTextColor(91, 104, 119)
  doc.text('Sea Salt Fineness Classification System', margin, 68)

  const gradeLabel = filters.grade && filters.grade !== 'All' ? filters.grade : 'All grades'
  doc.setTextColor(22, 32, 44)
  doc.text(`Period: ${describePeriod(filters)}`, margin, 92)
  doc.text(`Fineness grade: ${gradeLabel}`, margin, 106)
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
    styles: { fontSize: 10, cellPadding: 7, halign: 'center' },
    headStyles: { fillColor: navy, textColor: 255, fontStyle: 'bold' },
    bodyStyles: { fontStyle: 'bold', fontSize: 12 },
  })

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 18,
    margin: { left: margin, right: margin },
    theme: 'striped',
    head: [['Grade', 'Size range', 'Batches', 'Share', 'Sorted mass (kg)', 'Avg. confidence', 'Avg. time (s)']],
    body: summary.perGrade.map((row) => [
      row.grade,
      GRADE_META[row.grade].range.replace('–', ' - '),
      String(row.batches),
      `${row.sharePct.toFixed(1)} %`,
      row.massKg.toFixed(2),
      row.batches ? `${(row.avgConfidence * 100).toFixed(1)} %` : '-',
      row.batches ? row.avgProcessingTimeS.toFixed(1) : '-',
    ]),
    styles: { fontSize: 9, cellPadding: 5 },
    headStyles: { fillColor: navy, textColor: 255 },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' }, 4: { halign: 'right' }, 5: { halign: 'right' }, 6: { halign: 'right' } },
  })

  autoTable(doc, {
    startY: doc.lastAutoTable.finalY + 18,
    margin: { left: margin, right: margin, bottom: 46 },
    theme: 'striped',
    head: [['Record', 'Date and time', 'Sample', 'Batch', 'Grade', 'Confidence', 'Container', 'Mass (g)', 'Time (s)']],
    body: records.map((record) => [
      formatRecordId(record.record_id),
      formatDateTime(record.classified_at, { seconds: false }),
      record.sample_code,
      formatBatchId(record.batch_id),
      record.predicted_grade,
      `${(record.confidence * 100).toFixed(1)} %`,
      record.container_grade,
      record.mass_g.toFixed(1),
      record.processing_time_s.toFixed(1),
    ]),
    styles: { fontSize: 8, cellPadding: 4 },
    headStyles: { fillColor: navy, textColor: 255 },
    columnStyles: { 5: { halign: 'right' }, 7: { halign: 'right' }, 8: { halign: 'right' } },
  })

  const pageCount = doc.getNumberOfPages()
  doc.setFontSize(8)
  doc.setTextColor(125, 137, 150)
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page)
    doc.text('SALTFINE Dashboard', margin, pageHeight - 24)
    doc.text(`Page ${page} of ${pageCount}`, pageWidth - margin, pageHeight - 24, { align: 'right' })
  }

  const filename = reportFilename(filters, 'pdf')
  downloadBlob(doc.output('blob'), filename)
  return filename
}
