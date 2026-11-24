import { useMemo, useState } from 'react'
import GradeBarChart from '../components/reports/GradeBarChart'
import GradeSummaryTable from '../components/reports/GradeSummaryTable'
import ReportControls from '../components/reports/ReportControls'
import SummaryCards from '../components/reports/SummaryCards'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/PageState'
import { useToast } from '../components/ui/Toast'
import { usePolledQuery } from '../hooks/usePolledQuery'
import { getRecords } from '../services/api'
import { downloadReportCsv, downloadReportPdf } from '../services/exportReport'
import type { FilterState, SaltRecord } from '../types/saltfine'
import { describePeriod, EMPTY_FILTERS } from '../utils/filters'
import { formatDateTime, formatNumber, formatPercent } from '../utils/format'
import { type GradeStatSummary, summarize } from '../utils/stats'

interface ReportData {
  records: SaltRecord[]
  generatedAt: Date
}

// Tab 3: totals and charts for a chosen period, with CSV / PDF download.
export default function Reports() {
  const showToast = useToast()
  const [draft, setDraft] = useState<FilterState>(EMPTY_FILTERS)
  const [request, setRequest] = useState<{ filters: FilterState; run: number }>({ filters: EMPTY_FILTERS, run: 0 })
  const [exporting, setExporting] = useState(false)

  const { data, loading, error } = usePolledQuery<ReportData>(
    async () => ({ records: await getRecords(request.filters), generatedAt: new Date() }),
    [request],
  )

  const summary = useMemo(() => summarize(data?.records ?? []), [data])
  const filters = request.filters

  const generate = (next = draft) => {
    const cleaned: FilterState = { ...EMPTY_FILTERS, from: next.from, to: next.to, grade: next.grade }
    setDraft(cleaned)
    setRequest((current) => ({ filters: cleaned, run: current.run + 1 }))
  }

  const exportReport = async (kind: 'csv' | 'pdf') => {
    if (!data) return
    setExporting(true)
    try {
      const payload = { records: data.records, summary, filters, generatedAt: data.generatedAt }
      const filename = kind === 'csv' ? downloadReportCsv(payload) : await downloadReportPdf(payload)
      showToast(`Downloaded ${filename}`)
    } catch (exportError) {
      console.error(exportError)
      showToast(`Could not create the ${kind.toUpperCase()} file. Please try again.`, { tone: 'error' })
    } finally {
      setExporting(false)
    }
  }

  const hasRecords = summary.totalBatches > 0

  let body
  if (!data && loading) {
    body = <LoadingState title="Building the report…" />
  } else if (!data && error) {
    body = <ErrorState error={error} />
  } else if (!hasRecords) {
    body = (
      <EmptyState title="No batches in this period">
        Choose a wider date range or another grade, then generate the report again.
      </EmptyState>
    )
  } else {
    body = (
      <>
        <SummaryCards summary={summary} />

        <div className="grid gap-5 lg:grid-cols-2">
          <GradeBarChart<GradeStatSummary>
            title="Batches per quality grade"
            data={summary.perGrade}
            dataKey="batches"
            formatValue={(value) => formatNumber(value as number)}
            renderDetail={(row) => `${formatNumber(row.batches)} batches · ${formatPercent(row.sharePct)} of total`}
            summary={`Batches per quality grade: ${summary.perGrade
              .map((row) => `${row.grade} ${row.batches}`)
              .join(', ')}.`}
          />
          <GradeBarChart<GradeStatSummary>
            title="Sorted mass per container (kg)"
            data={summary.perGrade}
            dataKey="massKg"
            allowDecimals
            formatValue={(value) => Number(value).toFixed(1)}
            renderDetail={(row) => `${formatNumber(row.massKg, 2)} kg delivered to the ${row.grade} container`}
            summary={`Sorted mass per container in kilograms: ${summary.perGrade
              .map((row) => `${row.grade} ${row.massKg.toFixed(1)}`)
              .join(', ')}.`}
          />
        </div>

        <GradeSummaryTable summary={summary} />
      </>
    )
  }

  return (
    <div className="space-y-5">
      <ReportControls
        value={draft}
        onChange={setDraft}
        onGenerate={() => generate()}
        onPreset={(range) => generate({ ...draft, ...range })}
        onDownloadCsv={() => exportReport('csv')}
        onDownloadPdf={() => exportReport('pdf')}
        canDownload={Boolean(data) && hasRecords}
        exporting={exporting}
      />

      {data && (
        <p className="text-sm text-ink-500" aria-live="polite">
          <span className="font-semibold text-ink-900">{describePeriod(filters)}</span>
          {filters.grade !== 'All' && <> · {filters.grade} grade only</>} · generated{' '}
          <span className="font-mono text-[0.8rem]">{formatDateTime(data.generatedAt)}</span>
          {loading && ' · updating…'}
        </p>
      )}

      {body}
    </div>
  )
}
