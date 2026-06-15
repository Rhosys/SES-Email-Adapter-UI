import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'
import { execSync } from 'node:child_process'

/** Dev-only mock API middleware — serves mock data for /accounts/* routes when in mock mode. */
function mockApiPlugin(): Plugin {
  return {
    name: 'mock-api',
    apply: 'serve',
    configureServer(server) {
      // Only active in mock mode
      if (process.env.VITE_MOCK !== 'true') return

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/accounts') && req.url !== '/accounts') {
          return next()
        }

        // Dynamically import handlers — they use the mock data
        try {
          const { handleMockRequest } = await server.ssrLoadModule('/src/mocks/server-handler.ts')
          const result = await handleMockRequest(req.method ?? 'GET', req.url)
          if (result) {
            res.setHeader('Content-Type', 'application/json')
            res.setHeader('Access-Control-Allow-Origin', '*')
            res.statusCode = result.status
            res.end(JSON.stringify(result.body))
          } else {
            res.statusCode = 404
            res.end(JSON.stringify({ title: 'Not found' }))
          }
        } catch (e) {
          // eslint-disable-next-line no-console
          console.error('[mock-api]', e)
          res.statusCode = 500
          res.end(JSON.stringify({ title: 'Mock handler error' }))
        }
      })
    },
  }
}

function getBuildCommit(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

/** Injects environment variable placeholders into index.html at dev/build time. */
function envHtmlPlugin(): Plugin {
  return {
    name: 'env-html',
    transformIndexHtml(html) {
      const apiBase = process.env.VITE_API_BASE_URL ?? 'http://localhost:8787'
      const authressUrl = process.env.VITE_AUTHRESS_LOGIN_URL ?? 'https://login.rhosys.cloud'
      const wsUrl = apiBase.startsWith('https://')
        ? apiBase.replace('https://', 'wss://')
        : apiBase.replace('http://', 'ws://')
      return html
        .replaceAll('%VITE_API_BASE_URL%', apiBase)
        .replaceAll('%VITE_AUTHRESS_LOGIN_URL%', authressUrl)
        .replaceAll('%VITE_API_WS_URL%', wsUrl)
    },
  }
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [mockApiPlugin(), vue(), tailwindcss(), envHtmlPlugin()],
  define: {
    VERSION_INFO: JSON.stringify({
      releaseDate: new Date().toISOString(),
      buildNumber: process.env.BUILD_NUMBER ?? 'local',
      buildRef: process.env.BUILD_REF ?? 'local',
      buildCommit: getBuildCommit(),
    }),
    DEPLOYMENT_INFO: JSON.stringify({
      FDQN: process.env.VITE_DEPLOYMENT_FDQN ?? 'localhost',
      LOG_TARGET: process.env.VITE_LOG_TARGET ?? 'LOCAL',
    }),
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
    rollupOptions: {
      output: {
        // All JS/CSS/font/image chunks land in dist/assets/ with content hashes.
        // CloudFront serves /assets/* from a dedicated origin with immutable cache.
        assetFileNames: 'assets/[name]-[hash][extname]',
        chunkFileNames: 'assets/[name]-[hash].js',
        entryFileNames: 'assets/[name]-[hash].js',
      },
    },
  },
  server: {
    port: 8080,
  },
})
