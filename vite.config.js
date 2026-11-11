import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5180,
    // To open the dashboard from a tablet or another PC on the same network,
    // start it with:  npm run dev -- --host
  },
})
