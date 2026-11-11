// Central configuration for the SALTFINE dashboard.

export const APP_NAME = 'SALTFINE'
export const APP_TAGLINE = 'Sea Salt Fineness Classification System'

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

// The three fineness grades and their particle-size ranges (manuscript, sec. 2.2).
export const GRADES = ['Fine', 'Medium', 'Coarse']

// Class names are written out in full so Tailwind can find them at build time.
export const GRADE_META = {
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
