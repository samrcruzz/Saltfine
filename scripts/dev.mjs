// Starts the SALTURE backend (port 5000) and frontend (port 5173) together, from the main folder:
//   npm run dev
// Output from each server is prefixed with [backend] / [frontend]. Press Ctrl+C once to stop both.

import { spawn, spawnSync } from 'node:child_process'
import net from 'node:net'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const isWindows = process.platform === 'win32'
const npm = isWindows ? 'npm.cmd' : 'npm'
const SITE_URL = 'http://localhost:5173'

const servers = [
  { name: 'backend', dir: 'backend', port: 5000, color: '\x1b[36m', ready: /PostgreSQL (connected|not connected)/ },
  { name: 'frontend', dir: 'frontend', port: 5173, color: '\x1b[35m', ready: /Local:/ },
]
const RESET = '\x1b[0m'

function say(message) {
  console.log(`\x1b[1m[salture]\x1b[0m ${message}`)
}

/** true when something already listens on the port (e.g. the website is already running).
 *  Checks IPv4 and IPv6: Vite listens on "localhost", which is often ::1 only. */
async function portInUse(port) {
  return (await portOpen(port, '127.0.0.1')) || (await portOpen(port, '::1'))
}

function portOpen(port, host) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host })
    socket.setTimeout(800)
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('timeout', () => { socket.destroy(); resolve(false) })
    socket.once('error', () => resolve(false))
  })
}

/** Stops a server and everything it started (npm -> node -> tsx/vite). */
function stop(child) {
  if (!child || child.exitCode !== null || child.killed) return
  if (isWindows) spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  else child.kill('SIGTERM')
}

// 1. Setup checks, so a missing step gives a clear message instead of an npm error
const missing = servers.filter((s) => !fs.existsSync(path.join(root, s.dir, 'node_modules')))
if (missing.length > 0) {
  say(`Packages are not installed yet in: ${missing.map((s) => s.dir).join(', ')}`)
  say('Run this once from the main folder, then try again:  npm run setup')
  process.exit(1)
}
if (!fs.existsSync(path.join(root, 'backend', '.env'))) {
  say('backend\\.env is missing. Copy backend\\.env.example to backend\\.env and fill in PGPASSWORD and AUTH_SECRET.')
  process.exit(1)
}

// 2. Already running? Then there is nothing to start.
const busy = []
for (const s of servers) if (await portInUse(s.port)) busy.push(s)
if (busy.length === servers.length) {
  say(`The website is already running. Open ${SITE_URL}`)
  process.exit(0)
}
if (busy.length > 0) {
  const s = busy[0]
  say(`Port ${s.port} is already in use, so the ${s.name} cannot start.`)
  say(`Close the other window that runs the ${s.name} (Ctrl+C there), then run npm run dev again.`)
  process.exit(1)
}

// 3. Start both servers
const children = []
let readyCount = 0
let shuttingDown = false

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  say('Stopping the backend and frontend...')
  children.forEach(stop)
  setTimeout(() => process.exit(code), 300)
}

for (const s of servers) {
  // One command string (no args array): npm.cmd needs a shell on Windows, and Node warns about args + shell
  const child = spawn(`${npm} run dev`, {
    cwd: path.join(root, s.dir),
    shell: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '1' },
  })
  children.push(child)

  let seenReady = false
  const prefix = `${s.color}[${s.name}]${RESET} `
  const onData = (chunk) => {
    for (const line of chunk.toString().split(/\r?\n/)) {
      if (line.trim() === '') continue
      console.log(prefix + line)
      if (!seenReady && s.ready.test(line.replace(/\x1b\[[0-9;]*m/g, ''))) {
        seenReady = true
        readyCount += 1
        if (readyCount === servers.length) say(`Ready. Open ${SITE_URL}  (press Ctrl+C to stop)`)
      }
    }
  }
  child.stdout.on('data', onData)
  child.stderr.on('data', onData)
  child.on('exit', (code) => {
    if (shuttingDown) return
    say(`The ${s.name} stopped (exit code ${code ?? 'unknown'}), so the other server is stopped too.`)
    shutdown(code || 1)
  })
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
