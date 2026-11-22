import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'fs'
import os from 'os'
import path from 'path'
import type { AddressInfo } from 'net'
import type { Server } from 'http'

// Isolated accounts file + fixed secret, set BEFORE the app modules load.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'saltfine-auth-'))
process.env.SALTFINE_USERS_FILE = path.join(tmp, 'users.json')
process.env.AUTH_SECRET = 'test-secret-test-secret-test-secret-123'

const { hashPassword, verifyPassword } = await import('./passwords')
const { createSessionToken, readSessionToken, SESSION_TTL_MS } = await import('./session')
const users = await import('./users')
const { createApp } = await import('../app')

describe('passwords', () => {
  test('hash verifies only the same password', async () => {
    const h = await hashPassword('correct horse')
    assert.match(h, /^scrypt\$/)
    assert.equal(await verifyPassword('correct horse', h), true)
    assert.equal(await verifyPassword('wrong horse', h), false)
    assert.equal(await verifyPassword('x', 'garbage'), false)
  })
})

describe('session tokens', () => {
  const user = { username: 'ana', role: 'viewer' as const, passwordHash: 'scrypt$a$b', createdAt: '' }
  test('valid token round-trips', () => {
    assert.equal(readSessionToken(createSessionToken(user))?.u, 'ana')
  })
  test('tampered token is rejected', () => {
    const [body, sig] = createSessionToken(user).split('.')
    const forged = Buffer.from(JSON.stringify({ u: 'boss', exp: Date.now() + 1e6, v: 'x' })).toString('base64url')
    assert.equal(readSessionToken(`${forged}.${sig}`), null)
    assert.equal(readSessionToken(`${body}.${sig}x`), null)
    assert.equal(readSessionToken('nonsense'), null)
  })
  test('expired token is rejected', () => {
    const t = createSessionToken(user, Date.now() - SESSION_TTL_MS - 1)
    assert.equal(readSessionToken(t), null)
  })
})

describe('users file', () => {
  test('rejects bad names, short passwords, duplicates', async () => {
    await assert.rejects(users.addUser('../x', 'dev', 'longenough'), /Username/)
    await assert.rejects(users.addUser('shorty', 'dev', 'short'), /at least 8/)
    await users.addUser('dupe', 'viewer', 'longenough')
    await assert.rejects(users.addUser('DUPE', 'viewer', 'longenough'), /already exists/)
    assert.equal(users.removeUser('dupe'), true)
  })
})

describe('HTTP access by role', () => {
  let server: Server
  let base = ''

  before(async () => {
    await users.addUser('viewer1', 'viewer', 'viewer-pass')
    await users.addUser('dev1', 'dev', 'dev-pass-1')
    await users.addUser('locky', 'viewer', 'locky-pass')
    server = createApp().listen(0)
    await new Promise((r) => server.once('listening', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  after(() => {
    server.close()
    fs.rmSync(tmp, { recursive: true, force: true })
  })

  async function login(username: string, password: string) {
    const res = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    const cookie = (res.headers.get('set-cookie') ?? '').split(';')[0]
    return { res, cookie }
  }
  const get = (p: string, cookie = '') => fetch(`${base}${p}`, { headers: { cookie } })
  const post = (p: string, cookie = '', body: unknown = {}) =>
    fetch(`${base}${p}`, { method: 'POST', headers: { cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

  test('signed-out requests are refused, health stays public', async () => {
    assert.equal((await get('/api/records')).status, 401)
    assert.equal((await get('/api/images/x.jpg')).status, 401)
    assert.equal(await (await get('/api/auth/me')).json(), null)
    assert.equal((await get('/api/health')).status, 200)
  })

  test('wrong password -> 401 without cookie', async () => {
    const { res, cookie } = await login('viewer1', 'nope-nope')
    assert.equal(res.status, 401)
    assert.equal(cookie, '')
  })

  test('unknown user -> same 401 message', async () => {
    const { res } = await login('ghost', 'whatever1')
    assert.equal(res.status, 401)
    assert.deepEqual(await res.json(), { error: 'Wrong username or password' })
  })

  test('viewer can read but not change or analyze', async () => {
    const { res, cookie } = await login('Viewer1', 'viewer-pass') // name is case-insensitive
    assert.equal(res.status, 200)
    assert.deepEqual(await res.json(), { username: 'viewer1', role: 'viewer' })
    assert.match(res.headers.get('set-cookie') ?? '', /HttpOnly; SameSite=Lax/)
    assert.deepEqual(await (await get('/api/auth/me', cookie)).json(), { username: 'viewer1', role: 'viewer' })
    assert.equal((await get('/api/records', cookie)).status, 200)
    assert.equal((await get('/api/cycle/inbox', cookie)).status, 200)
    assert.equal((await post('/api/records', cookie)).status, 403)
    assert.equal((await post('/api/cycle/trigger', cookie)).status, 403)
    assert.equal((await post('/api/analyze/upload', cookie)).status, 403)
  })

  test('dev passes the role check', async () => {
    const { cookie } = await login('dev1', 'dev-pass-1')
    // no file attached -> the route itself answers 400, i.e. the role check let it through
    assert.equal((await post('/api/analyze/upload', cookie)).status, 400)
  })

  test('role change applies to an open session', async () => {
    const { cookie } = await login('dev1', 'dev-pass-1')
    users.setRole('dev1', 'viewer')
    assert.equal((await post('/api/analyze/upload', cookie)).status, 403)
    users.setRole('dev1', 'dev')
  })

  test('password change and removal end open sessions', async () => {
    const { cookie } = await login('viewer1', 'viewer-pass')
    await users.setPassword('viewer1', 'new-viewer-pass')
    assert.equal((await get('/api/records', cookie)).status, 401)
    const second = await login('viewer1', 'new-viewer-pass')
    users.removeUser('viewer1')
    assert.equal((await get('/api/records', second.cookie)).status, 401)
  })

  test('logout clears the cookie', async () => {
    const res = await post('/api/auth/logout')
    assert.match(res.headers.get('set-cookie') ?? '', /Max-Age=0/)
  })

  test('5 wrong passwords lock the name for a minute', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await login('locky', 'wrong-pass')).res.status, 401)
    const locked = await login('locky', 'locky-pass')
    assert.equal(locked.res.status, 429)
  })
})
