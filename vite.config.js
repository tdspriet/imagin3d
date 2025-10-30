import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/imagin3d/',
  build: {
    outDir: 'dist',
  },
  plugins: [react()],
  server: {
    port: 3000,
    open: true
  }
})
