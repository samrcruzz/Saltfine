// Central configuration for the SALTURE dashboard.

import type { FinenessGrade, GradeMetaMap, PurityGrade } from './types/saltfine'

// Demo mode: the dashboard runs without a backend on SIMULATED data (src/mockData), clearly labelled as demo.
// Off unless VITE_DEMO_MODE=true, so real results are never mixed up with simulated ones.
export const DEMO_MODE = import.meta.env.VITE_DEMO_MODE === 'true'
// Backend API (default http://localhost:5000). Not used in demo mode.
export const API_BASE_URL = DEMO_MODE
  ? ''
  : (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/+$/, '')

// Batch size of the thesis set-up: each photographed batch is 100 g unless the operator enters another mass.
export const DEFAULT_BATCH_MASS_G = 100

export const APP_NAME = 'SALTURE'
export const APP_TAGLINE = 'Sea Salt Fineness Classification System'
// Shown under the name in the dashboard sidebar and top bar (the sign-in page keeps APP_TAGLINE).
export const DASHBOARD_TAGLINE = 'User Dashboard'

// How often the dashboard asks the backend for the newest result (ms).
export const LIVE_POLL_INTERVAL_MS = 2000
// How often the Salt-Record Log re-runs its query to pick up new records (ms).
export const LOG_REFRESH_INTERVAL_MS = 5000
// Mock mode only: a new simulated sorting cycle is produced this often (ms).
export const SIMULATION_INTERVAL_MS = 24000
// Mock mode only: delay before the first simulated cycle after start/resume (ms).
export const SIMULATION_FIRST_CYCLE_MS = 6000

export const PAGE_SIZE_OPTIONS = [10, 25, 50]

// Visual capacity of one grade bin, used only to draw the fill level.
export const BIN_DISPLAY_CAPACITY_G = 600

// Quality and impurity classification tiers (Food Preprocessed <=0.20%, Industrial >0.20%)
export const PURITY_GRADES: (PurityGrade)[] = [
  'Preprocessed Food Goods',
  'Industrial Goods',
]

// The primary sorting grades across the application
export const GRADES: (PurityGrade | FinenessGrade)[] = [
  'Preprocessed Food Goods',
  'Industrial Goods',
]

// Visual metadata, colors, badges, and compliance tiers
export const GRADE_META: GradeMetaMap = {
  'Preprocessed Food Goods': {
    range: '≤ 0.20% Impurities',
    color: '#10b981',
    colorOnDark: '#34d399',
    badge: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30',
    solid: 'bg-emerald-600 text-white',
    fill: 'bg-emerald-500',
    track: 'bg-emerald-950/40',
    border: 'border-emerald-500',
    ink: 'text-emerald-400',
    description: 'Food Grade · Direct Human Consumption (RA 8172 / Codex CXS 150)',
  },
  'Industrial Goods': {
    range: '> 0.20% Impurities',
    color: '#f59e0b',
    colorOnDark: '#fbbf24',
    badge: 'bg-amber-500/15 text-amber-400 border border-amber-500/30',
    solid: 'bg-amber-600 text-white',
    fill: 'bg-amber-500',
    track: 'bg-amber-950/40',
    border: 'border-amber-500',
    ink: 'text-amber-400',
    description: 'Industrial Grade · Chemical, Water Treatment & De-icing',
  },
  Fine: {
    range: '0.20–0.99 mm',
    color: '#16a08c',
    colorOnDark: '#3cc7b2',
    badge: 'bg-grade-fine-soft text-grade-fine-ink',
    solid: 'bg-grade-fine-strong text-white',
    fill: 'bg-grade-fine',
    track: 'bg-grade-fine-soft',
    border: 'border-grade-fine',
    ink: 'text-grade-fine-ink',
  },
  Medium: {
    range: '1.00–1.99 mm',
    color: '#2f6fb8',
    colorOnDark: '#6fa5e3',
    badge: 'bg-grade-medium-soft text-grade-medium-ink',
    solid: 'bg-grade-medium-strong text-white',
    fill: 'bg-grade-medium',
    track: 'bg-grade-medium-soft',
    border: 'border-grade-medium',
    ink: 'text-grade-medium-ink',
  },
  Coarse: {
    range: '2.00–4.00 mm',
    color: '#cc7a2a',
    colorOnDark: '#e89f58',
    badge: 'bg-grade-coarse-soft text-grade-coarse-ink',
    solid: 'bg-grade-coarse-strong text-white',
    fill: 'bg-grade-coarse',
    track: 'bg-grade-coarse-soft',
    border: 'border-grade-coarse',
    ink: 'text-grade-coarse-ink',
  },
}
