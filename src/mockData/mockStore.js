// In-memory stand-in for the SQLite database + vision module.
//
// `mockDb` answers the same questions the Express backend will answer, and
// `simulation` plays the role of the machine: every SIMULATION_INTERVAL_MS it
// "finishes" a sorting cycle and appends a new record.

import { SIMULATION_FIRST_CYCLE_MS, SIMULATION_INTERVAL_MS } from '../config.js'
import { matchesFilters } from '../utils/filters.js'
import { createRecordFactory, seedHistory } from './generateRecords.js'

const makeRecord = createRecordFactory()

// Oldest first; the newest record is always last.
let records = seedHistory(makeRecord)

let running = false
let timer = null
const listeners = new Set()

const notify = () => listeners.forEach((listener) => listener())

function schedule(delay) {
  timer = setTimeout(() => {
    records = [...records, makeRecord(new Date())]
    schedule(SIMULATION_INTERVAL_MS)
  }, delay)
}

export const simulation = {
  start() {
    if (running) return
    running = true
    schedule(SIMULATION_FIRST_CYCLE_MS)
    notify()
  },
  stop() {
    if (!running) return
    running = false
    clearTimeout(timer)
    notify()
  },
  toggle() {
    if (running) simulation.stop()
    else simulation.start()
  },
  isRunning: () => running,
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
}

export const mockDb = {
  latest() {
    return records.length ? records[records.length - 1] : null
  },
  // Newest first. `limit` caps the number of rows returned.
  query(filters, { limit } = {}) {
    const rows = records.filter((record) => matchesFilters(record, filters)).reverse()
    return limit ? rows.slice(0, limit) : rows
  },
}

// The simulation is started by services/api.js, and only in mock mode.

// Stop the timer when Vite hot-reloads this module during development.
if (import.meta.hot) {
  import.meta.hot.dispose(() => clearTimeout(timer))
}
