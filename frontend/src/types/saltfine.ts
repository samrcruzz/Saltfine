// Core domain types for SALTURE sea salt purity & quality classification system.

export type PurityGrade = 'Preprocessed Food Goods' | 'Industrial Goods'
export type FinenessGrade = PurityGrade | 'Fine' | 'Medium' | 'Coarse'

export interface GradeMetaItem {
  range: string
  color: string
  colorOnDark: string
  badge: string
  solid: string
  fill: string
  track: string
  border: string
  ink: string
  description?: string
}

export type GradeMetaMap = Record<PurityGrade | 'Fine' | 'Medium' | 'Coarse', GradeMetaItem>

export interface SaltRecord {
  // classifications
  record_id: number
  model_name: string
  predicted_grade: PurityGrade | FinenessGrade
  purity_pct: number              // e.g., 99.85% (100 - impurity_pct)
  impurity_pct: number            // Key Metric: <= 0.20% Food Preprocessed, > 0.20% Industrial
  impurity_count: number          // Count of detected foreign/dark matter specks
  salt_crystal_count: number      // Count of clean salt crystals
  contamination_area_pct: number  // % of total area covered by impurities
  quality_tier?: PurityGrade
  confidence: number
  inference_ms: number            // YOLOv8 predict() time on the photo (ms), measured
  classified_at: string

  // batches
  batch_id: number
  sample_code: string
  supplier: string

  // images
  image_id: number
  file_path: string
  captured_at: string

  // particle_features
  particle_count: number          // salt crystals + impurities detected by YOLOv8

  // sorting_records
  sorting_id: number
  container_grade: PurityGrade | FinenessGrade | string
  mass_g: number                  // batch mass entered by the operator (default 100 g)
  processing_time_s: number       // measured wall-clock time of the image analysis (s)
  sorted_at: string

  /** true = simulated demo record (mock mode / SEED_DEMO_DATA), not measured from a photo */
  is_demo?: boolean
}

export interface FilterState {
  from: string
  to: string
  grade: PurityGrade | FinenessGrade | 'All'
  query: string
}

export type SortColumn = 'record_id' | 'classified_at' | 'confidence' | 'mass_g'
export type SortDirection = 'asc' | 'desc'

export interface SortState {
  column: SortColumn
  direction: SortDirection
}

export interface NavigationPage {
  id: string
  label: string
  shortLabel: string
  status: string
  icon: React.ComponentType<{ className?: string }>
  component: React.ComponentType<{ onNavigate?: (id: string) => void }>
  /** Who can open the page. Default: every signed-in user. */
  minRole?: 'viewer' | 'dev'
}

export interface ReportStats {
  totalBatches: number
  totalMassKg: number
  avgConfidence: number
  avgProcessingTimeS: number
  byGrade: Record<FinenessGrade, {
    count: number
    massKg: number
    pctBatches: number
    pctMass: number
    avgConfidence: number
  }>
  chartData: Array<{
    grade: FinenessGrade
    batches: number
    massKg: number
    color: string
  }>
}
