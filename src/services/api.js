// Data access layer. Pages never touch the mock store or `fetch` directly;
// they call these functions, so switching from mock data to the real
// Express + SQLite backend only changes this file.
//
// Mock mode (default): VITE_API_BASE_URL is not set.
// API mode: set VITE_API_BASE_URL (see .env.example). Expected endpoints,
// all returning JSON with the record shape documented in
// src/mockData/generateRecords.js:
//
//   GET /api/records/latest                         -> record | null
//   GET /api/records?from=&to=&grade=&q=&limit=     -> record[] (newest first)
//   GET /api/images/:image_id                       -> the captured image file

import { EMPTY_FILTERS } from '../utils/filters.js'
import { mockDb, simulation } from '../mockData/mockStore.js'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

export const USE_MOCK = !BASE_URL

// In mock mode, start producing simulated sorting cycles.
if (USE_MOCK) simulation.start()

// Small artificial delay so loading states are visible in mock mode.
const MOCK_LATENCY_MS = 120
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function request(path, params) {
  const url = new URL(`${BASE_URL}${path}`)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, value)
  }
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${path}`)
  return response.json()
}

// Most recent sorting cycle, or null when the database is empty.
export async function getLatestRecord() {
  if (USE_MOCK) {
    await wait(MOCK_LATENCY_MS)
    return mockDb.latest()
  }
  return request('/api/records/latest')
}

// Records matching the filters, newest first.
export async function getRecords(filters = EMPTY_FILTERS, { limit } = {}) {
  if (USE_MOCK) {
    await wait(MOCK_LATENCY_MS)
    return mockDb.query(filters, { limit })
  }
  return request('/api/records', {
    from: filters.from,
    to: filters.to,
    grade: filters.grade === 'All' ? '' : filters.grade,
    q: filters.query?.trim(),
    limit,
  })
}

// URL of the captured image, or null in mock mode (a simulated image is
// drawn in the browser instead).
export function getImageUrl(record) {
  if (USE_MOCK || !record) return null
  return `${BASE_URL}/api/images/${record.image_id}`
}
