import { Router, Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import { dbService } from '../db'
import { AnalysisError, analysisResponse, buildRecord, parseMassG, runPythonPipeline, uploadDir, type PipelineResult } from './analyze'

const router = Router()

// Until the camera is wired in, a "cycle" processes the next photo dropped into this folder.
// The camera software (or you) saves photos here; each trigger takes the OLDEST one.
export const cameraInbox = path.resolve(process.cwd(), process.env.CAMERA_INBOX || 'camera_inbox')
if (!fs.existsSync(cameraInbox)) fs.mkdirSync(cameraInbox, { recursive: true })

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.bmp', '.webp'])

function nextInboxImage(): string | null {
  const files = fs
    .readdirSync(cameraInbox)
    .filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
    .map((f) => ({ f, t: fs.statSync(path.join(cameraInbox, f)).mtimeMs }))
    .sort((a, b) => a.t - b.t)
  return files.length ? files[0].f : null
}

// GET /api/cycle/inbox -> how many photos are waiting
router.get('/inbox', (_req: Request, res: Response) => {
  const waiting = fs.readdirSync(cameraInbox).filter((f) => IMAGE_EXTS.has(path.extname(f).toLowerCase()))
  res.json({ folder: cameraInbox, waiting: waiting.length })
})

// POST /api/cycle/trigger -> analyze the next camera photo with the YOLOv8 model, save + return the record
// Optional body/query field massG (or mass_g): the weighed batch mass in grams, default 100 g.
// If the model cannot grade the photo, nothing is saved and the photo goes back to the inbox for a retry.
router.post('/trigger', async (req: Request, res: Response) => {
  try {
    const mass = parseMassG(req.body?.massG, req.body?.mass_g, req.query.massG)
    if ('error' in mass) {
      res.status(400).json({ error: mass.error })
      return
    }
    const name = nextInboxImage()
    if (!name) {
      res.status(404).json({ error: `No new photo in the camera inbox (${cameraInbox}). Save a photo there and trigger again.` })
      return
    }
    // Move (not copy) into uploads/ so the photo is processed once and the original is kept.
    const ext = path.extname(name)
    const base = path.basename(name, ext).replace(/[^a-zA-Z0-9-_]/g, '_')
    const stored = `SALT_${Date.now()}_${base}${ext}`
    const src = path.join(cameraInbox, name)
    const dst = path.join(uploadDir, stored)
    fs.renameSync(src, dst)
    const size = fs.statSync(dst).size

    let result: PipelineResult
    try {
      result = await runPythonPipeline(dst)
    } catch (error) {
      fs.renameSync(dst, src) // keep the photo for the next trigger
      const reason = error instanceof Error ? error.message : String(error)
      res.status(error instanceof AnalysisError ? 503 : 500).json({
        error: `Image analysis failed for ${name}: ${reason}. No result was recorded; the photo is back in the camera inbox.`,
      })
      return
    }
    const record = buildRecord(result, stored, { sampleCode: `CAM-${String(Date.now()).slice(-5)}`, massG: mass.massG })
    await dbService.insertRecord(record)
    res.json({ ...record, analysis: analysisResponse({ originalname: name, size, filename: stored }, result, record) })
  } catch (error) {
    res.status(500).json({ error: (error as Error).message })
  }
})

export default router
