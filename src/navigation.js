import { lazy } from 'react'
import { Activity, ChartColumn, ClipboardList } from 'lucide-react'
import LiveResult from './pages/LiveResult.jsx'
import SaltRecordLog from './pages/SaltRecordLog.jsx'

// The Reports page pulls in the charting library, so it is loaded on first
// visit instead of with the initial page.
const Reports = lazy(() => import('./pages/Reports.jsx'))

// The three dashboard tabs. `status` is the label shown next to the
// connection dot in the header when a real backend is connected.
export const PAGES = [
  {
    id: 'live',
    label: 'Live Classification Result',
    shortLabel: 'Live Result',
    status: 'Vision module connected',
    icon: Activity,
    component: LiveResult,
  },
  {
    id: 'records',
    label: 'Salt-Record Log',
    shortLabel: 'Salt Records',
    status: 'Database connected',
    icon: ClipboardList,
    component: SaltRecordLog,
  },
  {
    id: 'reports',
    label: 'Reports',
    shortLabel: 'Reports',
    status: 'Database connected',
    icon: ChartColumn,
    component: Reports,
  },
]

export const PAGE_IDS = PAGES.map((page) => page.id)
export const DEFAULT_PAGE_ID = 'live'
