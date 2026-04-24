import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const port = Number(env.VITE_PORT || 3000)

  return {
    base: '/imagin3d/',
    build: {
      outDir: 'dist',
    },
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port,
      strictPort: true,
      open: true,
      historyApiFallback: {
        rewrites: [{ from: /.*/, to: '/index.html' }]
      }
    }
  }
})
