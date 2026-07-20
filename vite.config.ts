import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'
import { execSync } from 'node:child_process'

// Deploys live under a base path: '/a/' for main, '/pr/<slug>/' for previews,
// '/' locally. The service worker scope and navigation fallback are derived from
// this, so the PWA is correctly isolated per deployment.
const basePath = process.env.VITE_BASE_PATH ?? '/'

/** Dev-only mock API middleware — serves mock data for /accounts/* routes when in mock mode. */
function mockApiPlugin(): Plugin {
  let isMockMode = false
  return {
    name: 'mock-api',
    apply: 'serve',
    config(_cfg, { mode }) {
      isMockMode = mode === 'mock'
    },
    configureServer(server) {
      if (!isMockMode) return

      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/accounts')) {
          return next()
        }

        // Dynamically import handlers — they use the mock data
        try {
          const { handleMockRequest } = await server.ssrLoadModule('/src/mocks/server-handler.ts')
          const result = await handleMockRequest(req.method ?? 'GET', req.url)
          if (result) {
            if (result.status === 204) {
              res.statusCode = 204
              res.end()
            } else {
              res.setHeader('Content-Type', 'application/json')
              res.setHeader('Access-Control-Allow-Origin', '*')
              res.statusCode = result.status
              res.end(JSON.stringify(result.body))
            }
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
  base: basePath,
  plugins: [
    mockApiPlugin(),
    vue(),
    tailwindcss(),
    envHtmlPlugin(),
    VitePWA({
      // New deploys activate and are picked up on the next load — matches the
      // existing stale-while-revalidate "quietly refresh in the background" policy.
      registerType: 'autoUpdate',
      // Emit a same-origin registerSW.js instead of an inline script, so the
      // strict CSP (script-src 'self' 'unsafe-inline') is satisfied cleanly.
      injectRegister: 'script',
      // A hand-written service worker (src/sw.ts) — precache/update behavior stays
      // identical to before (via workbox-precaching below), but this is required
      // to add a notificationclick handler: showing notification actions and
      // routing their clicks is only possible from a SW's own event listener, not
      // from the page (`new Notification()` supports neither).
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      // Generate PNG / maskable / apple-touch icons at build time from the source
      // SVG (see pwa-assets.config.ts). Nothing rasterized is committed to git;
      // the icons and their manifest/HTML links are produced during `vite build`.
      // (Independent of `strategies` — coexists fine with injectManifest.)
      pwaAssets: {
        config: true,
        image: 'public/favicon.svg',
      },
      manifest: {
        name: 'SES Email Adapter',
        short_name: 'SES Adapter',
        description: 'Intelligent email routing and filtering powered by AI',
        display: 'standalone',
        background_color: '#1e1e2e',
        theme_color: '#1e1e2e',
      },
      injectManifest: {
        // Precache the built app shell so the installed app loads instantly and
        // is installable. API/auth still require connectivity (the SW scope is the
        // deploy base path, so it never intercepts the /api origin routes).
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
      },
      // Keep the PWA service worker disabled in dev so it never conflicts with the
      // MSW mock worker used by `dev:mock`.
      devOptions: { enabled: false },
    }),
  ],
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
