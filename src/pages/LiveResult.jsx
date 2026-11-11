import BatchStrip from '../components/live/BatchStrip.jsx'
import CapturedImageCard from '../components/live/CapturedImageCard.jsx'
import ParticleCard from '../components/live/ParticleCard.jsx'
import PredictedGradeCard from '../components/live/PredictedGradeCard.jsx'
import RecentRecordsCard from '../components/live/RecentRecordsCard.jsx'
import SizeFractionsCard from '../components/live/SizeFractionsCard.jsx'
import SortingCard from '../components/live/SortingCard.jsx'
import { EmptyState, ErrorState, LoadingState } from '../components/ui/PageState.jsx'
import { LIVE_POLL_INTERVAL_MS } from '../config.js'
import { usePolledQuery } from '../hooks/usePolledQuery.js'
import { getLatestRecord, getRecords } from '../services/api.js'

const RECENT_COUNT = 5

// Tab 1: the current / most recent sorting cycle. The page polls the backend
// for the newest record and refreshes itself when a new batch arrives.
export default function LiveResult({ onNavigate }) {
  const latest = usePolledQuery(getLatestRecord, [], {
    intervalMs: LIVE_POLL_INTERVAL_MS,
    signature: (record) => record?.record_id ?? null,
  })
  const recent = usePolledQuery(() => getRecords(undefined, { limit: RECENT_COUNT }), [], {
    intervalMs: LIVE_POLL_INTERVAL_MS,
    signature: (rows) => rows[0]?.record_id ?? null,
  })

  const record = latest.data

  if (!record) {
    if (latest.loading) return <LoadingState title="Waiting for the latest result…" />
    if (latest.error) return <ErrorState error={latest.error} />
    return (
      <EmptyState title="No batches classified yet">
        The first result will appear here as soon as a sorting cycle finishes.
      </EmptyState>
    )
  }

  return (
    // The key restarts the short fade whenever a new batch replaces the old one.
    <div key={record.record_id} className="animate-refresh space-y-5">
      <BatchStrip record={record} />

      {/*
        Landscape tablet and up (lg): image and details on the left, result cards on the right,
        as in the manuscript mockup. Portrait tablet: the predicted grade comes first,
        then the image, then the details and recent records.
      */}
      <div className="grid gap-5 lg:grid-cols-12 lg:grid-rows-[auto_1fr]">
        <div className="grid content-start gap-5 md:grid-cols-2 lg:col-span-5 lg:col-start-8 lg:row-start-1 lg:grid-cols-1">
          <PredictedGradeCard record={record} />
          <SizeFractionsCard record={record} />
        </div>

        <div className="space-y-5 lg:col-span-7 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <CapturedImageCard record={record} />
          <div className="grid gap-5 md:grid-cols-2">
            <ParticleCard record={record} />
            <SortingCard record={record} />
          </div>
        </div>

        <RecentRecordsCard
          records={recent.data ?? []}
          onViewAll={() => onNavigate('records')}
          className="self-start lg:col-span-5 lg:col-start-8 lg:row-start-2"
        />
      </div>
    </div>
  )
}
