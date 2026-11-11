// Draws a simulated "captured image" of crushed salt on the spreading plate.
//
// Mock mode has no camera, so instead of depending on external image URLs the
// frame is drawn on a <canvas> from the record itself: the number and size of
// the crystals follow the record's particle count and estimated fractions,
// and the drawing is seeded by the record ID so the same record always
// produces the same picture.

import { CLASS_AREA_MM2 } from '../mockData/generateRecords.js'
import { mulberry32 } from './random.js'

export const IMAGE_WIDTH = 960
export const IMAGE_HEIGHT = 640
// Width of the plate covered by one frame. 960 px / 60 mm = 16 px per mm.
export const FIELD_OF_VIEW_MM = 60
export const SCALE_BAR_MM = 10

const PX_PER_MM = IMAGE_WIDTH / FIELD_OF_VIEW_MM

// Drawn largest first so smaller crystals settle around the big ones.
const CLASSES = [
  { grade: 'Coarse', key: 'est_coarse_pct', min: 2.0, max: 4.0 },
  { grade: 'Medium', key: 'est_medium_pct', min: 1.0, max: 1.99 },
  { grade: 'Fine', key: 'est_fine_pct', min: 0.2, max: 0.99 },
]

function countsPerClass(record) {
  const weights = CLASSES.map((cls) => record[cls.key] / CLASS_AREA_MM2[cls.grade])
  const total = weights.reduce((sum, weight) => sum + weight, 0) || 1
  return weights.map((weight) => Math.round((record.particle_count * weight) / total))
}

function placeParticles(rand, counts) {
  const large = []
  const particles = []

  CLASSES.forEach((cls, index) => {
    const avoidOverlap = cls.grade !== 'Fine'
    for (let i = 0; i < counts[index]; i += 1) {
      const diameterMm = cls.min + (cls.max - cls.min) * Math.pow(rand(), 1.6)
      const r = (diameterMm * PX_PER_MM) / 2
      let x = 0
      let y = 0
      let tries = 0
      let overlaps = false
      do {
        x = r + rand() * (IMAGE_WIDTH - 2 * r)
        y = r + rand() * (IMAGE_HEIGHT - 2 * r)
        tries += 1
        overlaps =
          avoidOverlap &&
          large.some((p) => (p.x - x) ** 2 + (p.y - y) ** 2 < (p.r + r) ** 2 * 0.8)
      } while (overlaps && tries < 14)

      if (avoidOverlap) large.push({ x, y, r })
      particles.push({ x, y, r })
    }
  })

  return particles
}

function tracePolygon(ctx, points, dx = 0, dy = 0) {
  ctx.beginPath()
  points.forEach(([px, py], index) => {
    if (index === 0) ctx.moveTo(px + dx, py + dy)
    else ctx.lineTo(px + dx, py + dy)
  })
  ctx.closePath()
}

function drawCrystal(ctx, rand, { x, y, r }) {
  const sides = 5 + Math.floor(rand() * 3)
  const rotation = rand() * Math.PI * 2
  const points = []
  for (let i = 0; i < sides; i += 1) {
    const angle = rotation + (i / sides) * Math.PI * 2 + (rand() - 0.5) * 0.5
    const radius = r * (0.78 + rand() * 0.34)
    points.push([x + Math.cos(angle) * radius, y + Math.sin(angle) * radius])
  }

  // Soft contact shadow on the plate.
  if (r > 3) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.34)'
    tracePolygon(ctx, points, r * 0.14, r * 0.18)
    ctx.fill()
  }

  // Crystal body: slightly translucent, cool white.
  const tone = 226 + Math.floor(rand() * 22)
  ctx.fillStyle = `rgba(${tone}, ${Math.min(255, tone + 3)}, ${Math.min(255, tone + 7)}, ${0.86 + rand() * 0.12})`
  tracePolygon(ctx, points)
  ctx.fill()

  // Larger crystals get an edge and a bright facet.
  if (r > 6) {
    ctx.strokeStyle = 'rgba(140, 158, 176, 0.4)'
    ctx.lineWidth = 1
    ctx.stroke()

    const facet = points.map(([px, py]) => [x + (px - x) * 0.5 - r * 0.14, y + (py - y) * 0.5 - r * 0.14])
    ctx.fillStyle = 'rgba(255, 255, 255, 0.6)'
    tracePolygon(ctx, facet)
    ctx.fill()
  }
}

export function drawSaltImage(canvas, record) {
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const rand = mulberry32(record.record_id * 7919 + 13)
  const width = IMAGE_WIDTH
  const height = IMAGE_HEIGHT

  // Matte dark plate under diffuse LED light.
  ctx.fillStyle = '#20272e'
  ctx.fillRect(0, 0, width, height)

  const light = ctx.createRadialGradient(width / 2, height / 2, height * 0.1, width / 2, height / 2, width * 0.72)
  light.addColorStop(0, 'rgba(130, 150, 170, 0.16)')
  light.addColorStop(1, 'rgba(0, 0, 0, 0.32)')
  ctx.fillStyle = light
  ctx.fillRect(0, 0, width, height)

  // Fine surface grain of the plate.
  for (let i = 0; i < 3200; i += 1) {
    ctx.fillStyle = `rgba(255, 255, 255, ${0.015 + rand() * 0.035})`
    ctx.fillRect(rand() * width, rand() * height, 1, 1)
  }

  const particles = placeParticles(rand, countsPerClass(record))
  for (const particle of particles) drawCrystal(ctx, rand, particle)
}
