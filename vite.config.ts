import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { getGpvSchedule } from './server/gpv.js'

function gpvSchedule(): Plugin {
  return {
    name: 'gpv-schedule',
    configureServer(server) {
      // Same contract as server.js: no schedule is a 503, never a 200 with null.
      server.middlewares.use('/gpv', async (_req, res) => {
        const schedule = await getGpvSchedule()
        res.setHeader('Content-Type', 'application/json')
        if (!schedule) {
          res.statusCode = 503
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify({ error: 'schedule unavailable' }))
          return
        }
        res.setHeader('Cache-Control', 'public, max-age=60')
        res.end(JSON.stringify(schedule))
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
