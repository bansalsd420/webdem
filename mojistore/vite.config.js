// mojistore/vite.config.js
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwind from '@tailwindcss/vite'

export default ({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const apiTarget = env.VITE_API_PROXY_TARGET || 'http://localhost:4000'

  return defineConfig({
    plugins: [react(), tailwind()],      // ← add this
    server: {
      port: 5173,
      strictPort: true,
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true, secure: false },
        '/img': { target: apiTarget, changeOrigin: true, secure: false },
      },
    },
  })
}
