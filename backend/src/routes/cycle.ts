import { Router, Request, Response } from 'express'
import fs from 'fs'
import path from 'path'
import { dbService } from '../db'
import { analysisResponse, buildRecord, runPythonPipeline, uploadDir } from './analyze'

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
router.post('/trigger', async (_req: Request, res: Response) => {
  try {
    const name = nextInboxImage()
    if (!name) {
      res.status(404).json({ error: `No new photo in the camera inbox (${cameraInbox}). Save a photo there and trigger again.` })
      return
    }
    // Move (not copy) into uploads/ so the photo is processed once and the original is kept.
    const ext = path.extname(name)
    const base = path.basename(name, ext).replace(/[^a-zA-Z0-9-_]/g, '_')
    const stored = `SALT_${Date.now()}_${base}${ext}`
    const dst = path.join(uploadDir, stored)
    fs.renameSync(path.join(cameraInbox, name), dst)
    const size = fs.statSync(dst).size

    const pyResult = await runPythonPipeline(dst)
    const record = buildRecord(pyResult, stored, { sampleCode: `CAM-${String(Date.now()).slice(-5)}` })
    await dbService.insertRecord(record)
    res.json({ ...record, analysis: analysisResponse({ originalname: name, size, filename: stored }, pyResult, record) })
  } catch (error) {
    res.status(500).json({ error: (error as Error).message })
  }
})

export default router
