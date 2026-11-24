// Manage SALTURE sign-in accounts (run from backend/):
//   npm run users -- add <name> --role viewer|dev     asks for the password
//   npm run users -- list
//   npm run users -- passwd <name>                    asks for the new password
//   npm run users -- role <name> viewer|dev
//   npm run users -- remove <name>
// For scripts, the password can come from the SALTFINE_PASSWORD environment variable instead.

import 'dotenv/config'
import { addUser, isRole, loadUsers, removeUser, ROLES, setPassword, setRole, usersFile } from '../auth/users'

function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin
    if (!stdin.isTTY) {
      reject(new Error('No terminal to ask for the password: set SALTFINE_PASSWORD instead'))
      return
    }
    process.stdout.write(question)
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    let value = ''
    const onData = (chunk: string) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          process.stdout.write('\n')
          resolve(value)
          return
        }
        if (ch === '\u0003') {
          process.stdout.write('\n')
          process.exit(130)
        }
        if (ch === '\u007f' || ch === '\b') value = value.slice(0, -1)
        else value += ch
      }
    }
    stdin.on('data', onData)
  })
}

async function newPassword(): Promise<string> {
  if (process.env.SALTFINE_PASSWORD) return process.env.SALTFINE_PASSWORD
  const first = await askHidden('Password: ')
  const second = await askHidden('Repeat password: ')
  if (first !== second) throw new Error('The passwords do not match')
  return first
}

function roleArg(value: string | undefined): (typeof ROLES)[number] {
  if (!value || !isRole(value)) throw new Error(`Give a role: ${ROLES.join(' or ')}`)
  return value
}

async function main() {
  const [command, name, ...rest] = process.argv.slice(2)
  const flag = (n: string) => {
    const i = rest.indexOf(n)
    return i >= 0 ? rest[i + 1] : undefined
  }

  switch (command) {
    case 'add': {
      if (!name) throw new Error('Usage: npm run users -- add <name> --role viewer|dev')
      const role = roleArg(flag('--role'))
      const user = await addUser(name, role, await newPassword())
      console.log(`Added ${user.username} (${user.role}) to ${usersFile()}`)
      break
    }
    case 'list': {
      const users = loadUsers()
      if (!users.length) console.log('No users yet.')
      for (const u of users) console.log(`  ${u.username.padEnd(20)} ${u.role.padEnd(7)} created ${u.createdAt}`)
      break
    }
    case 'passwd': {
      if (!name) throw new Error('Usage: npm run users -- passwd <name>')
      await setPassword(name, await newPassword())
      console.log(`Password changed for ${name}. Their open sessions are signed out.`)
      break
    }
    case 'role': {
      if (!name) throw new Error('Usage: npm run users -- role <name> viewer|dev')
      setRole(name, roleArg(rest[0]))
      console.log(`${name} is now ${rest[0]}`)
      break
    }
    case 'remove': {
      if (!name) throw new Error('Usage: npm run users -- remove <name>')
      console.log(removeUser(name) ? `Removed ${name}` : `No user '${name}'`)
      break
    }
    default:
      console.log('Commands: add <name> --role viewer|dev | list | passwd <name> | role <name> viewer|dev | remove <name>')
  }
}

main().catch((err) => {
  console.error(`Error: ${(err as Error).message}`)
  process.exit(1)
})
