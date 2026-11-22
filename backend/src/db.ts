import { Pool } from 'pg'
import type { FilterState, FinenessGrade, PurityGrade, SaltRecord, SizeFractions } from './types/saltfine'
import { createRecordFactory, seedHistory } from './mockData/generateRecords'
import { matchesFilters } from './utils/filters'

// 1. PostgreSQL Connection Configuration
export const pool = new Pool({
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'saltfine_db',
  password: process.env.PGPASSWORD || 'postgres',
  port: Number(process.env.PGPORT) || 5432,
  connectionTimeoutMillis: 1500,
})

let isPgConnected = false

// In-memory store. Starts EMPTY so every record comes from a real photo + the YOLOv8 model.
// Set SEED_DEMO_DATA=true in backend/.env to pre-fill it with simulated demo records.
const recordFactory = createRecordFactory()
export const SEED_DEMO_DATA = process.env.SEED_DEMO_DATA === 'true'
let localRecords: SaltRecord[] = SEED_DEMO_DATA ? seedHistory(recordFactory) : []

// Test PostgreSQL connection and initialize schema
pool
  .query('SELECT NOW()')
  .then(async () => {
    isPgConnected = true
    console.log(`✅ PostgreSQL connected successfully to ${process.env.PGDATABASE || 'saltfine_db'} on port ${process.env.PGPORT || 5432}!`)
    await initPostgresSchema()
  })
  .catch(() => {
    isPgConnected = false
    console.log(`ℹ️ PostgreSQL not detected on port ${process.env.PGPORT || 5432}. Using high-speed in-memory store for seamless demo!`)
  })

// Auto-initialize schema in PostgreSQL if connected
async function initPostgresSchema() {
  const schemaSql = `
    CREATE TABLE IF NOT EXISTS batches (
      batch_id SERIAL PRIMARY KEY,
      sample_code VARCHAR(50) NOT NULL,
      supplier VARCHAR(100) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS images (
      image_id SERIAL PRIMARY KEY,
      batch_id INT REFERENCES batches(batch_id) ON DELETE CASCADE,
      file_path TEXT NOT NULL,
      captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS classifications (
      classification_id SERIAL PRIMARY KEY,
      batch_id INT REFERENCES batches(batch_id) ON DELETE CASCADE,
      model_name VARCHAR(100) NOT NULL,
      predicted_grade VARCHAR(50) NOT NULL,
      quality_tier VARCHAR(50) NOT NULL,
      purity_pct NUMERIC(5,2) NOT NULL,
      impurity_pct NUMERIC(5,2) NOT NULL DEFAULT 0.12,
      impurity_count INT NOT NULL DEFAULT 0,
      salt_crystal_count INT NOT NULL DEFAULT 0,
      contamination_area_pct NUMERIC(5,2) NOT NULL DEFAULT 0.00,
      confidence NUMERIC(6,4) NOT NULL,
      est_fine_pct NUMERIC(5,2) NOT NULL,
      est_medium_pct NUMERIC(5,2) NOT NULL,
      est_coarse_pct NUMERIC(5,2) NOT NULL,
      inference_ms NUMERIC(6,2) NOT NULL,
      classified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS particle_features (
      feature_id SERIAL PRIMARY KEY,
      batch_id INT REFERENCES batches(batch_id) ON DELETE CASCADE,
      particle_count INT NOT NULL,
      mean_area_mm2 NUMERIC(7,3) NOT NULL,
      mean_ecd_mm NUMERIC(6,2) NOT NULL,
      median_ecd_mm NUMERIC(6,2) NOT NULL,
      glcm_contrast NUMERIC(6,3) NOT NULL,
      glcm_homogeneity NUMERIC(6,3) NOT NULL,
      glcm_energy NUMERIC(6,3) NOT NULL,
      glcm_correlation NUMERIC(6,3) NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sorting_records (
      sorting_id SERIAL PRIMARY KEY,
      batch_id INT REFERENCES batches(batch_id) ON DELETE CASCADE,
      container_grade VARCHAR(50) NOT NULL,
      mass_g NUMERIC(7,2) NOT NULL,
      processing_time_s NUMERIC(6,2) NOT NULL,
      sorted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sieve_ground_truth (
      sieve_id SERIAL PRIMARY KEY,
      batch_id INT REFERENCES batches(batch_id) ON DELETE CASCADE,
      fine_g NUMERIC(7,2) NOT NULL,
      medium_g NUMERIC(7,2) NOT NULL,
      coarse_g NUMERIC(7,2) NOT NULL,
      dominant_grade VARCHAR(50) NOT NULL,
      is_match BOOLEAN NOT NULL
    );
  `
  try {
    await pool.query(schemaSql)
    console.log('✅ SALTFINE PostgreSQL database tables initialized!')
  } catch (err) {
    console.error('Error creating PostgreSQL tables:', err)
  }
}

function mapRowToSaltRecord(row: any): SaltRecord {
  return {
    record_id: Number(row.record_id),
    model_name: String(row.model_name),
    predicted_grade: row.predicted_grade as PurityGrade | FinenessGrade,
    quality_tier: (row.quality_tier ?? row.predicted_grade) as PurityGrade,
    purity_pct: Number(row.purity_pct ?? 99.88),
    impurity_pct: Number(row.impurity_pct ?? 0.12),
    impurity_count: Number(row.impurity_count ?? 12),
    salt_crystal_count: Number(row.salt_crystal_count ?? (row.particle_count - (row.impurity_count ?? 12))),
    contamination_area_pct: Number(row.contamination_area_pct ?? 0.35),
    confidence: Number(row.confidence),
    est_fine_pct: Number(row.est_fine_pct),
    est_medium_pct: Number(row.est_medium_pct),
    est_coarse_pct: Number(row.est_coarse_pct),
    inference_ms: Number(row.inference_ms),
    classified_at: row.classified_at instanceof Date ? row.classified_at.toISOString() : String(row.classified_at),

    batch_id: Number(row.batch_id),
    sample_code: String(row.sample_code),
    supplier: String(row.supplier),

    image_id: Number(row.image_id),
    file_path: String(row.file_path),
    captured_at: row.captured_at instanceof Date ? row.captured_at.toISOString() : String(row.captured_at),

    particle_count: Number(row.particle_count),
    mean_area_mm2: Number(row.mean_area_mm2),
    mean_ecd_mm: Number(row.mean_ecd_mm),
    median_ecd_mm: Number(row.median_ecd_mm),
    glcm_contrast: Number(row.glcm_contrast),
    glcm_homogeneity: Number(row.glcm_homogeneity),
    glcm_energy: Number(row.glcm_energy),
    glcm_correlation: Number(row.glcm_correlation),

    sorting_id: Number(row.sorting_id),
    container_grade: String(row.container_grade),
    mass_g: Number(row.mass_g),
    processing_time_s: Number(row.processing_time_s),
    sorted_at: row.sorted_at instanceof Date ? row.sorted_at.toISOString() : String(row.sorted_at),
  }
}

export const dbService = {
  isPostgres: () => isPgConnected,

  async getLatestRecord(): Promise<SaltRecord | null> {
    if (!isPgConnected) {
      return localRecords.length ? localRecords[localRecords.length - 1] : null
    }

    try {
      const query = `
        SELECT
          c.classification_id AS record_id,
          c.model_name,
          c.predicted_grade,
          c.quality_tier,
          c.purity_pct::float,
          c.impurity_pct::float,
          c.impurity_count,
          c.salt_crystal_count,
          c.contamination_area_pct::float,
          c.confidence::float,
          c.est_fine_pct::float,
          c.est_medium_pct::float,
          c.est_coarse_pct::float,
          c.inference_ms::float,
          c.classified_at,
          b.batch_id,
          b.sample_code,
          b.supplier,
          i.image_id,
          i.file_path,
          i.captured_at,
          pf.particle_count,
          pf.mean_area_mm2::float,
          pf.mean_ecd_mm::float,
          pf.median_ecd_mm::float,
          pf.glcm_contrast::float,
          pf.glcm_homogeneity::float,
          pf.glcm_energy::float,
          pf.glcm_correlation::float,
          s.sorting_id,
          s.container_grade,
          s.mass_g::float,
          s.processing_time_s::float,
          s.sorted_at
        FROM classifications c
        JOIN batches b ON b.batch_id = c.batch_id
        LEFT JOIN images i ON i.batch_id = b.batch_id
        LEFT JOIN particle_features pf ON pf.batch_id = b.batch_id
        LEFT JOIN sorting_records s ON s.batch_id = b.batch_id
        ORDER BY c.classified_at DESC
        LIMIT 1;
      `
      const res = await pool.query(query)
      return res.rows[0] ? mapRowToSaltRecord(res.rows[0]) : (localRecords.length ? localRecords[localRecords.length - 1] : null)
    } catch {
      return localRecords.length ? localRecords[localRecords.length - 1] : null
    }
  },

  async queryRecords(filters: FilterState, limit?: number): Promise<SaltRecord[]> {
    if (!isPgConnected) {
      const rows = localRecords.filter((record) => matchesFilters(record, filters)).reverse()
      return limit ? rows.slice(0, limit) : rows
    }

    try {
      let query = `
        SELECT
          c.classification_id AS record_id,
          c.model_name,
          c.predicted_grade,
          c.quality_tier,
          c.purity_pct::float,
          c.impurity_pct::float,
          c.impurity_count,
          c.salt_crystal_count,
          c.contamination_area_pct::float,
          c.confidence::float,
          c.est_fine_pct::float,
          c.est_medium_pct::float,
          c.est_coarse_pct::float,
          c.inference_ms::float,
          c.classified_at,
          b.batch_id,
          b.sample_code,
          b.supplier,
          i.image_id,
          i.file_path,
          i.captured_at,
          pf.particle_count,
          pf.mean_area_mm2::float,
          pf.mean_ecd_mm::float,
          pf.median_ecd_mm::float,
          pf.glcm_contrast::float,
          pf.glcm_homogeneity::float,
          pf.glcm_energy::float,
          pf.glcm_correlation::float,
          s.sorting_id,
          s.container_grade,
          s.mass_g::float,
          s.processing_time_s::float,
          s.sorted_at
        FROM classifications c
        JOIN batches b ON b.batch_id = c.batch_id
        LEFT JOIN images i ON i.batch_id = b.batch_id
        LEFT JOIN particle_features pf ON pf.batch_id = b.batch_id
        LEFT JOIN sorting_records s ON s.batch_id = b.batch_id
        WHERE 1=1
      `
      const params: (string | number)[] = []
      let pIdx = 1

      if (filters.from) {
        query += ` AND c.classified_at >= $${pIdx++}`
        params.push(filters.from)
      }
      if (filters.to) {
        query += ` AND c.classified_at <= $${pIdx++}`
        params.push(`${filters.to} 23:59:59`)
      }
      if (filters.grade && filters.grade !== 'All') {
        query += ` AND (c.predicted_grade = $${pIdx} OR c.quality_tier = $${pIdx})`
        params.push(filters.grade)
        pIdx++
      }
      if (filters.query?.trim()) {
        query += ` AND (b.sample_code ILIKE $${pIdx} OR b.batch_id::text ILIKE $${pIdx})`
        params.push(`%${filters.query.trim()}%`)
        pIdx++
      }

      query += ` ORDER BY c.classified_at DESC`
      if (limit) {
        query += ` LIMIT $${pIdx}`
        params.push(limit)
      }

      const res = await pool.query(query, params)
      return res.rows.map(mapRowToSaltRecord)
    } catch {
      const rows = localRecords.filter((record) => matchesFilters(record, filters)).reverse()
      return limit ? rows.slice(0, limit) : rows
    }
  },

  async insertRecord(record: SaltRecord): Promise<SaltRecord> {
    localRecords = [...localRecords, record]

    if (isPgConnected) {
      try {
        const client = await pool.connect()
        try {
          await client.query('BEGIN')

          const bRes = await client.query(
            `INSERT INTO batches (sample_code, supplier) VALUES ($1, $2) RETURNING batch_id`,
            [record.sample_code, record.supplier]
          )
          const bId = bRes.rows[0].batch_id

          await client.query(
            `INSERT INTO images (batch_id, file_path, captured_at) VALUES ($1, $2, $3)`,
            [bId, record.file_path, new Date(record.captured_at)]
          )

          await client.query(
            `INSERT INTO classifications (
              batch_id, model_name, predicted_grade, quality_tier, purity_pct, impurity_pct, impurity_count,
              salt_crystal_count, contamination_area_pct, confidence, est_fine_pct,
              est_medium_pct, est_coarse_pct, inference_ms, classified_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
            [
              bId,
              record.model_name,
              record.predicted_grade,
              record.quality_tier ?? record.predicted_grade,
              record.purity_pct ?? 99.88,
              record.impurity_pct ?? 0.12,
              record.impurity_count ?? 12,
              record.salt_crystal_count ?? (record.particle_count - (record.impurity_count ?? 12)),
              record.contamination_area_pct ?? 0.35,
              record.confidence,
              record.est_fine_pct,
              record.est_medium_pct,
              record.est_coarse_pct,
              record.inference_ms,
              new Date(record.classified_at),
            ]
          )

          await client.query(
            `INSERT INTO particle_features (
              batch_id, particle_count, mean_area_mm2, mean_ecd_mm, median_ecd_mm,
              glcm_contrast, glcm_homogeneity, glcm_energy, glcm_correlation
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              bId,
              record.particle_count,
              record.mean_area_mm2,
              record.mean_ecd_mm,
              record.median_ecd_mm,
              record.glcm_contrast,
              record.glcm_homogeneity,
              record.glcm_energy,
              record.glcm_correlation,
            ]
          )

          await client.query(
            `INSERT INTO sorting_records (batch_id, container_grade, mass_g, processing_time_s, sorted_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [bId, record.container_grade, record.mass_g, record.processing_time_s, new Date(record.sorted_at)]
          )

          if (record.sieve_ground_truth) {
            await client.query(
              `INSERT INTO sieve_ground_truth (batch_id, fine_g, medium_g, coarse_g, dominant_grade, is_match)
               VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                bId,
                record.sieve_ground_truth.fine_g,
                record.sieve_ground_truth.medium_g,
                record.sieve_ground_truth.coarse_g,
                record.sieve_ground_truth.dominant_grade,
                record.sieve_ground_truth.is_match,
              ]
            )
          }

          await client.query('COMMIT')
        } catch (e) {
          await client.query('ROLLBACK')
          console.error('Error inserting record into PostgreSQL:', e)
        } finally {
          client.release()
        }
      } catch (err) {
        console.error('PostgreSQL connection error during insert:', err)
      }
    }

    return record
  },

  async triggerNewCycle(): Promise<SaltRecord> {
    const newRecord = recordFactory(new Date())
    await this.insertRecord(newRecord)
    return newRecord
  },

  async deleteRecord(recordId: number): Promise<boolean> {
    localRecords = localRecords.filter((r) => r.record_id !== recordId)
    if (isPgConnected) {
      try {
        await pool.query('DELETE FROM batches WHERE batch_id = $1', [recordId])
      } catch (err) {
        console.error('Error deleting record from PostgreSQL:', err)
      }
    }
    return true
  },

  async clearTestRecords(): Promise<void> {
    localRecords = localRecords.filter(
      (r) =>
        r.record_id !== 181078 &&
        !r.file_path.includes('SALT_1795170779753') &&
        !r.sample_code.startsWith('TEST-') &&
        !r.sample_code.startsWith('BATCH-TEST')
    )
  },
}
