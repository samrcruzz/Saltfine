// Data access layer for SALTFINE fullstack PERN application.

import { mockDb, simulation } from '../mockData/mockStore'
import type { FilterState, FinenessGrade, PurityGrade, SaltRecord, SizeFractions } from '../types/saltfine'
import { EMPTY_FILTERS } from '../utils/filters'

const BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '')

export const USE_MOCK = !BASE_URL

// In mock mode only, start producing simulated sorting cycles.
if (USE_MOCK) simulation.start()

const MOCK_LATENCY_MS = 120
const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  params?: Record<string, string | number | undefined | null>
  body?: unknown
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', params, body } = options
  const url = new URL(`${BASE_URL}${path}`)

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(key, String(value))
  }

  const headers: Record<string, string> = { Accept: 'application/json' }
  let bodyPayload: BodyInit | undefined = undefined

  if (body) {
    headers['Content-Type'] = 'application/json'
    bodyPayload = JSON.stringify(body)
  }

  const response = await fetch(url.toString(), {
    method,
    headers,
    body: bodyPayload,
  })

  if (!response.ok) throw new Error(`Request failed (${response.status}) for ${path}`)
  return response.json()
}

// Most recent sorting cycle, or null when the database is empty.
export async function getLatestRecord(): Promise<SaltRecord | null> {
  if (USE_MOCK) {
    await wait(MOCK_LATENCY_MS)
    return mockDb.latest()
  }
  return request<SaltRecord | null>('/api/records/latest')
}

// Records matching the filters, newest first.
export async function getRecords(filters: FilterState = EMPTY_FILTERS, { limit }: { limit?: number } = {}): Promise<SaltRecord[]> {
  if (USE_MOCK) {
    await wait(MOCK_LATENCY_MS)
    return mockDb.query(filters, { limit })
  }
  return request<SaltRecord[]>('/api/records', {
    params: {
      from: filters.from,
      to: filters.to,
      grade: filters.grade === 'All' ? '' : filters.grade,
      q: filters.query?.trim(),
      limit,
    },
  })
}

// URL of the captured image, or null in mock mode
export function getImageUrl(record: SaltRecord | null | undefined): string | null {
  if (!record) return null
  if (record.file_path.startsWith('http') || record.file_path.startsWith('blob:')) return record.file_path
  if (BASE_URL && record.file_path.startsWith('/api/images')) return `${BASE_URL}${record.file_path}`
  return null
}

// Manual trigger for hardware trigger endpoint
export async function triggerNewCycle(): Promise<SaltRecord> {
  if (USE_MOCK) {
    await wait(MOCK_LATENCY_MS)
    return simulation.triggerNow()
  }
  return request<SaltRecord>('/api/cycle/trigger', { method: 'POST' })
}

// Save a custom sample (from Lab Analysis) to the backend database
export async function saveRecord(record: SaltRecord): Promise<SaltRecord> {
  if (USE_MOCK) {
    await wait(MOCK_LATENCY_MS)
    simulation.addCustomRecord(record)
    return record
  }
  return request<SaltRecord>('/api/records', { method: 'POST', body: record })
}

export interface UploadResult {
  fileName: string
  fileSize: string
  fileUrl: string
  storedFilename?: string
  record?: SaltRecord
  model_name: string
  predicted_grade: FinenessGrade | PurityGrade
  quality_tier?: PurityGrade
  purity_pct?: number
  impurity_count?: number
  salt_crystal_count?: number
  contamination_area_pct?: number
  confidence: number
  fractions: SizeFractions
  particle_count: number
  mean_ecd_mm: number
  median_ecd_mm: number
  mean_area_mm2: number
  inference_ms: number
  glcm_contrast: number
  glcm_homogeneity: number
  glcm_energy: number
  glcm_correlation: number
}

// Upload image file to Express backend and optionally auto-save directly into the Salt Records DB
export async function uploadImageFile(
  file: File,
  options: { saveToDb?: boolean; sampleCode?: string } = {}
): Promise<UploadResult> {
  if (USE_MOCK) {
    await wait(150)
    const hash = Array.from(file.name).reduce((acc, c) => acc + c.charCodeAt(0), 0)
    const roll = (hash % 100) / 100

    let grade: PurityGrade = 'Preprocessed Food Goods'
    let impurity_pct = 0.12
    if (roll < 0.65) {
      grade = 'Preprocessed Food Goods'
      impurity_pct = Number((0.06 + (hash % 13) / 100).toFixed(2)) // <= 0.20%
    } else {
      grade = 'Industrial Goods'
      impurity_pct = Number((0.20 + (hash % 6) / 100).toFixed(2)) // > 0.20%
    }

    const purity_pct = Number((100 - impurity_pct).toFixed(2))
    const particle_count = 650 + (hash % 700)
    const impurity_count = Math.max(1, Math.round(particle_count * (impurity_pct / 100) * 14))
    const salt_crystal_count = particle_count - impurity_count
    const contamination_area_pct = impurity_pct

    const ecd = 1.48
    const id = (Date.now() % 90000) + Math.floor(Math.random() * 1000)
    const mockRec: SaltRecord = {
      record_id: id,
      batch_id: id,
      sample_code: options.sampleCode || `IMG-${String(id).slice(-4)}`,
      supplier: 'Dasol Artisanal Salt',
      image_id: id,
      file_path: URL.createObjectURL(file),
      captured_at: new Date().toISOString(),
      model_name: 'SALTFINE Impurity Detector',
      predicted_grade: grade,
      quality_tier: grade,
      purity_pct,
      impurity_pct,
      impurity_count,
      salt_crystal_count,
      contamination_area_pct,
      confidence: 0.94,
      est_fine_pct: 70,
      est_medium_pct: 25,
      est_coarse_pct: 5,
      inference_ms: 18.5,
      classified_at: new Date().toISOString(),
      particle_count,
      mean_area_mm2: Number(((Math.PI / 4) * ecd ** 2).toFixed(3)),
      mean_ecd_mm: ecd,
      median_ecd_mm: Number((ecd * 0.94).toFixed(2)),
      glcm_contrast: 0.42,
      glcm_homogeneity: 0.78,
      glcm_energy: 0.16,
      glcm_correlation: 0.84,
      sorting_id: id,
      container_grade: grade,
      mass_g: Number((180 + (id % 200)).toFixed(1)),
      processing_time_s: 1.2,
      sorted_at: new Date().toISOString(),
    }
    if (options.saveToDb) {
      simulation.addCustomRecord(mockRec)
    }
    return {
      fileName: file.name,
      fileSize: `${(file.size / 1024).toFixed(1)} KB`,
      fileUrl: mockRec.file_path,
      record: mockRec,
      model_name: 'SALTFINE Impurity Detector',
      predicted_grade: grade,
      quality_tier: grade,
      purity_pct,
      impurity_count,
      salt_crystal_count,
      contamination_area_pct,
      confidence: 0.94,
      fractions: { fine: 70, medium: 25, coarse: 5 },
      particle_count,
      mean_ecd_mm: mockRec.mean_ecd_mm,
      median_ecd_mm: mockRec.median_ecd_mm,
      mean_area_mm2: mockRec.mean_area_mm2,
      inference_ms: mockRec.inference_ms,
      glcm_contrast: mockRec.glcm_contrast,
      glcm_homogeneity: mockRec.glcm_homogeneity,
      glcm_energy: mockRec.glcm_energy,
      glcm_correlation: mockRec.glcm_correlation,
    }
  }

  const formData = new FormData()
  formData.append('image', file)
  if (options.saveToDb) formData.append('saveToDb', 'true')
  if (options.sampleCode) formData.append('sampleCode', options.sampleCode)

  const response = await fetch(`${BASE_URL}/api/analyze/upload`, {
    method: 'POST',
    body: formData,
  })
  if (!response.ok) throw new Error(`Upload failed (${response.status})`)
  return response.json()
}
