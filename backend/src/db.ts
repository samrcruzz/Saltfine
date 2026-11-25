import { Pool } from 'pg'
import type { FilterState, FinenessGrade, PurityGrade, SaltRecord } from './types/saltfine'
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
// Set SEED_DEMO_DATA=true in backend/.env to pre-fill it with simulated demo records (off by default).
// Demo records carry is_demo: true, are only kept in memory (never written to PostgreSQL) and are
// labelled as demo data in the dashboard.
const recordFactory = createRecordFactory()
export const SEED_DEMO_DATA = process.env.SEED_DEMO_DATA === 'true'
let localRecords: SaltRecord[] = SEED_DEMO_DATA ? seedHistory(recordFactory) : []
if (SEED_DEMO_DATA) {
  console.warn(`⚠️  SEED_DEMO_DATA=true: ${localRecords.length} SIMULATED demo records loaded (not measured). Do not use them for evaluation.`)
}

// Test PostgreSQL connection and initialize schema
pool
  .query('SELECT NOW()')
  .then(async () => {
    isPgConnected = true
    console.log(`✅ PostgreSQL connected successfully to ${process.env.PGDATABASE || 'saltfine_db'} on port ${process.env.PGPORT || 5432}!`)
    await initPostgresSchema()
  })
  .catch((err: { code?: string; message?: string }) => {
    isPgConnected = false
    // Say WHY, so a wrong password or a missing database is not mistaken for "PostgreSQL is not installed"
    const db = process.env.PGDATABASE || 'saltfine_db'
    const reason =
      err.code === '28P01' ? `wrong password for user "${process.env.PGUSER || 'postgres'}" (check PGPASSWORD in backend/.env)`
      : err.code === '3D000' ? `database "${db}" does not exist yet (create it with createdb)`
      : err.code === 'ECONNREFUSED' ? `nothing is listening on port ${process.env.PGPORT || 5432}`
      : err.message || 'unknown error'
    console.log(`ℹ️ PostgreSQL not connected: ${reason}. Using the in-memory store (records are lost when the server restarts).`)
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

    -- Every column below holds a value measured on the photo, entered by the operator, or a timestamp.
    -- No defaults for measurements: a missing value must fail the insert, not be filled in.
    CREATE TABLE IF NOT EXISTS classifications (
      classification_id SERIAL PRIMARY KEY,
      batch_id INT REFERENCES batches(batch_id) ON DELETE CASCADE,
      model_name VARCHAR(100) NOT NULL,
      predicted_grade VARCHAR(50) NOT NULL,
      quality_tier VARCHAR(50) NOT NULL,
      purity_pct NUMERIC(5,2) NOT NULL,
      impurity_pct NUMERIC(5,2) NOT NULL,
      impurity_count INT NOT NULL,
      salt_crystal_count INT NOT NULL,
      contamination_area_pct NUMERIC(5,2) NOT NULL,
      confidence NUMERIC(6,4) NOT NULL,
      inference_ms NUMERIC(6,2) NOT NULL,
      classified_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS particle_features (
      feature_id SERIAL PRIMARY KEY,
      batch_id INT REFERENCES batches(batch_id) ON DELETE CASCADE,
      particle_count INT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sorting_records (
      sorting_id SERIAL PRIMARY KEY,
      batch_id INT REFERENCES batches(batch_id) ON DELETE CASCADE,
      container_grade VARCHAR(50) NOT NULL,
      mass_g NUMERIC(7,2) NOT NULL,
      processing_time_s NUMERIC(6,2) NOT NULL,
      sorted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `
  try {
    await pool.query(schemaSql)
    await pool.query(LEGACY_COLUMNS_MIGRATION)
    console.log('✅ SALTURE PostgreSQL database tables initialized!')
  } catch (err) {
    console.error('Error creating PostgreSQL tables:', err)
  }
}

// Databases created by older versions have columns for values the model never measured (size fractions,
// ECD/area in mm, GLCM texture) as NOT NULL, and made-up defaults on some measurements. New records leave
// the legacy columns empty, so relax those constraints. Nothing is dropped: old tables (including
// sieve_ground_truth) and their rows stay as they are, they are just no longer written or read.
const LEGACY_COLUMNS_MIGRATION = `
  DO $$
  DECLARE col record;
  BEGIN
    FOR col IN
      SELECT table_name, column_name, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND (table_name::text, column_name::text) IN (
          ('classifications', 'est_fine_pct'), ('classifications', 'est_medium_pct'), ('classifications', 'est_coarse_pct'),
          ('particle_features', 'mean_area_mm2'), ('particle_features', 'mean_ecd_mm'), ('particle_features', 'median_ecd_mm'),
          ('particle_features', 'glcm_contrast'), ('particle_features', 'glcm_homogeneity'),
          ('particle_features', 'glcm_energy'), ('particle_features', 'glcm_correlation'))
        AND is_nullable = 'NO'
    LOOP
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP NOT NULL', col.table_name, col.column_name);
    END LOOP;

    FOR col IN
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'classifications'
        AND column_name IN ('impurity_pct', 'impurity_count', 'salt_crystal_count', 'contamination_area_pct')
        AND column_default IS NOT NULL
    LOOP
      EXECUTE format('ALTER TABLE %I ALTER COLUMN %I DROP DEFAULT', col.table_name, col.column_name);
    END LOOP;
  END $$;
`

// Columns of one SaltRecord, shared by getLatestRecord and queryRecords
const RECORD_COLUMNS = `
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
  c.inference_ms::float,
  c.classified_at,
  b.batch_id,
  b.sample_code,
  b.supplier,
  i.image_id,
  i.file_path,
  i.captured_at,
  pf.particle_count,
  s.sorting_id,
  s.container_grade,
  s.mass_g::float,
  s.processing_time_s::float,
  s.sorted_at
`

const RECORD_JOINS = `
  FROM classifications c
  JOIN batches b ON b.batch_id = c.batch_id
  LEFT JOIN images i ON i.batch_id = b.batch_id
  LEFT JOIN particle_features pf ON pf.batch_id = b.batch_id
  LEFT JOIN sorting_records s ON s.batch_id = b.batch_id
`

function mapRowToSaltRecord(row: any): SaltRecord {
  return {
    record_id: Number(row.record_id),
    model_name: String(row.model_name),
    predicted_grade: row.predicted_grade as PurityGrade | FinenessGrade,
    quality_tier: (row.quality_tier ?? row.predicted_grade) as PurityGrade,
    purity_pct: Number(row.purity_pct),
    impurity_pct: Number(row.impurity_pct),
    impurity_count: Number(row.impurity_count),
    salt_crystal_count: Number(row.salt_crystal_count),
    contamination_area_pct: Number(row.contamination_area_pct),
    confidence: Number(row.confidence),
    inference_ms: Number(row.inference_ms),
    classified_at: row.classified_at instanceof Date ? row.classified_at.toISOString() : String(row.classified_at),

    batch_id: Number(row.batch_id),
    sample_code: String(row.sample_code),
    supplier: String(row.supplier),

    image_id: Number(row.image_id),
    file_path: String(row.file_path),
    captured_at: row.captured_at instanceof Date ? row.captured_at.toISOString() : String(row.captured_at),

    particle_count: Number(row.particle_count),

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
      const query = `SELECT ${RECORD_COLUMNS} ${RECORD_JOINS} ORDER BY c.classified_at DESC LIMIT 1;`
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
      let query = `SELECT ${RECORD_COLUMNS} ${RECORD_JOINS} WHERE 1=1`
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
              salt_crystal_count, contamination_area_pct, confidence, inference_ms, classified_at
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
            [
              bId,
              record.model_name,
              record.predicted_grade,
              record.quality_tier ?? record.predicted_grade,
              record.purity_pct,
              record.impurity_pct,
              record.impurity_count,
              record.salt_crystal_count,
              record.contamination_area_pct,
              record.confidence,
              record.inference_ms,
              new Date(record.classified_at),
            ]
          )

          await client.query(
            `INSERT INTO particle_features (batch_id, particle_count) VALUES ($1, $2)`,
            [bId, record.particle_count]
          )

          await client.query(
            `INSERT INTO sorting_records (batch_id, container_grade, mass_g, processing_time_s, sorted_at)
             VALUES ($1, $2, $3, $4, $5)`,
            [bId, record.container_grade, record.mass_g, record.processing_time_s, new Date(record.sorted_at)]
          )

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
