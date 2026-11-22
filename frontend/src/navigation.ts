import { lazy } from 'react'
import { Activity, ChartColumn, ClipboardList, FlaskConical } from 'lucide-react'
import LiveResult from './pages/LiveResult'
import SaltRecordLog from './pages/SaltRecordLog'
import type { NavigationPage } from './types/saltfine'

// The Reports and Analysis pages are loaded lazily
const Reports = lazy(() => import('./pages/Reports'))
const LabAnalysis = lazy(() => import('./pages/LabAnalysis'))

export const PAGES: NavigationPage[] = [
  {
    id: 'live',
    label: 'Live Classification Result',
    shortLabel: 'Live Result',
    status: 'Vision module connected',
    icon: Activity,
    component: LiveResult,
  },
  {
    id: 'analysis',
    label: 'Lab & Image Analysis',
    shortLabel: 'Lab Analysis',
    status: 'Analysis engine ready',
    icon: FlaskConical,
    component: LabAnalysis,
    minRole: 'dev',
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

export const PAGE_IDS: string[] = PAGES.map((page) => page.id)
export const DEFAULT_PAGE_ID = 'live'
