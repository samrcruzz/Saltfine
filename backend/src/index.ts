import 'dotenv/config'
import { createApp } from './app'
import { loadUsers } from './auth/users'

const PORT = Number(process.env.PORT) || 5000
const app = createApp()

app.listen(PORT, () => {
  console.log(`🚀 SALTURE PERN Server is running on http://localhost:${PORT}`)
  console.log(`📁 Static image endpoint: http://localhost:${PORT}/api/images`)
  if (loadUsers().length === 0) {
    console.warn('⚠️  No user accounts yet, so nobody can sign in. Create the first one with:')
    console.warn('      npm run users -- add <name> --role dev')
  }
})
