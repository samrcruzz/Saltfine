// User accounts, kept in a small JSON file so they survive restarts even without PostgreSQL.
// Default location: backend/data/users.json (git-ignored). Override with SALTFINE_USERS_FILE.
// Manage accounts with:  npm run users -- add <name> --role viewer|dev

import fs from 'fs'
import path from 'path'
import { hashPassword, MIN_PASSWORD_LENGTH } from './passwords'

export type Role = 'viewer' | 'dev'
export const ROLES: Role[] = ['viewer', 'dev']

export interface StoredUser {
  username: string
  role: Role
  passwordHash: string
  createdAt: string
}

export const USERNAME_PATTERN = /^[a-z0-9._-]{2,32}$/i

export function usersFile(): string {
  return process.env.SALTFINE_USERS_FILE || path.resolve(process.cwd(), 'data', 'users.json')
}

export function loadUsers(): StoredUser[] {
  const file = usersFile()
  if (!fs.existsSync(file)) return []
  const data = JSON.parse(fs.readFileSync(file, 'utf8'))
  return Array.isArray(data.users) ? data.users : []
}

function saveUsers(users: StoredUser[]): void {
  const file = usersFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ users }, null, 2) + '\n')
  fs.renameSync(tmp, file)
}

export function findUser(username: string): StoredUser | undefined {
  const name = username.trim().toLowerCase()
  return loadUsers().find((u) => u.username.toLowerCase() === name)
}

function checkPassword(password: string): void {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  }
}

export function isRole(value: string): value is Role {
  return (ROLES as string[]).includes(value)
}

export async function addUser(username: string, role: Role, password: string): Promise<StoredUser> {
  const name = username.trim()
  if (!USERNAME_PATTERN.test(name)) {
    throw new Error('Username must be 2-32 characters: letters, digits, dot, dash or underscore')
  }
  if (!isRole(role)) throw new Error(`Role must be one of: ${ROLES.join(', ')}`)
  if (findUser(name)) throw new Error(`User '${name}' already exists`)
  checkPassword(password)
  const user: StoredUser = { username: name, role, passwordHash: await hashPassword(password), createdAt: new Date().toISOString() }
  saveUsers([...loadUsers(), user])
  return user
}

function updateUser(username: string, change: (u: StoredUser) => StoredUser): StoredUser {
  const users = loadUsers()
  const i = users.findIndex((u) => u.username.toLowerCase() === username.trim().toLowerCase())
  if (i < 0) throw new Error(`No user '${username}'`)
  users[i] = change(users[i])
  saveUsers(users)
  return users[i]
}

export async function setPassword(username: string, password: string): Promise<void> {
  checkPassword(password)
  const passwordHash = await hashPassword(password)
  updateUser(username, (u) => ({ ...u, passwordHash }))
}

export function setRole(username: string, role: Role): void {
  if (!isRole(role)) throw new Error(`Role must be one of: ${ROLES.join(', ')}`)
  updateUser(username, (u) => ({ ...u, role }))
}

export function removeUser(username: string): boolean {
  const users = loadUsers()
  const rest = users.filter((u) => u.username.toLowerCase() !== username.trim().toLowerCase())
  if (rest.length === users.length) return false
  saveUsers(rest)
  return true
}
