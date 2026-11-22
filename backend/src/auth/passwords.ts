// Password hashing with Node's built-in scrypt (no extra dependency).
// Stored format: scrypt$<salt base64url>$<key base64url>

import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'crypto'

const KEY_LENGTH = 64
export const MIN_PASSWORD_LENGTH = 8

function scrypt(password: string, salt: Buffer, length: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, length, (err, key) => (err ? reject(err) : resolve(key)))
  })
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const key = await scrypt(password, salt, KEY_LENGTH)
  return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, salt, key] = stored.split('$')
  if (scheme !== 'scrypt' || !salt || !key) return false
  const expected = Buffer.from(key, 'base64url')
  const actual = await scrypt(password, Buffer.from(salt, 'base64url'), expected.length)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}
