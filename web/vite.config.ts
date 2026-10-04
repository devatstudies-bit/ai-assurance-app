import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// The API (backend/) runs on :8000; proxy it so the browser sees one origin
const api = { '/api': { target: process.env.API_URL ?? 'http://localhost:8000', changeOrigin: true } }

export default defineConfig({
  plugins: [react()],
  server: { proxy: api },
  preview: { proxy: api },
})
