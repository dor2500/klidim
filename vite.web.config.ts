// Runs only the renderer in a plain browser (no Electron) for quick UI checks.
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  root: resolve(__dirname, 'src/renderer'),
  base: './',
  plugins: [react()],
  server: { port: 5184, strictPort: true }
})
