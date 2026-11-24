import express from 'express'
import cors from 'cors'
import path from 'path'
import { authenticate, readAnyWriteDev, requireAuth, requireDev } from './auth/middleware'
import authRouter from './routes/auth'
import recordsRouter from './routes/records'
import analyzeRouter from './routes/analyze'
import cycleRouter from './routes/cycle'

// Who may do what:
//   viewer  sign in, see live results, records, reports and images
//   dev     everything a viewer can, plus upload/analyze photos, trigger cycles, save/delete records
export function createApp() {
  const app = express()

  // Allow the Vite dev server on port 5173 / 5180 (credentials = the session cookie)
  app.use(
    cors({
      origin: ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5180', 'http://127.0.0.1:5180'],
      credentials: true,
    })
  )
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))
  app.use(authenticate)

  // Public
  app.use('/api/auth', authRouter)
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'online',
      system: 'SALTURE Automated Sea Salt Fineness Sorter',
      version: '1.0.0-ts',
      timestamp: new Date().toISOString(),
    })
  })

  // Signed in
  const uploadDir = path.join(process.cwd(), 'uploads')
  app.use('/api/images', requireAuth, express.static(uploadDir))
  app.use('/api/records', readAnyWriteDev, recordsRouter)
  app.use('/api/cycle', readAnyWriteDev, cycleRouter)

  // Dev only
  app.use('/api/analyze', requireDev, analyzeRouter)

  return app
}
