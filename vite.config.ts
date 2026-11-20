import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { getGpvSchedule } from './server/gpv.js'

function gpvSchedule(): Plugin {
  return {
    name: 'gpv-schedule',
    configureServer(server) {
      server.middlewares.use('/gpv', async (_req, res) => {
        res.setHeader('Content-Type', 'application/json')
        res.setHeader('Cache-Control', 'public, max-age=60')
        res.end(JSON.stringify(await getGpvSchedule()))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    gpvSchedule(),
  ],
  server: {
    proxy: {
      '/api-proxy': {
        target: 'https://power-api.loe.lviv.ua/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api-proxy/, ''),
        secure: false,
      }
    }
  }
})
