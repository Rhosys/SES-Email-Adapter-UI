import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

/** Injects %VITE_API_WS_URL% into index.html — derived from VITE_API_BASE_URL at build time. */
function apiWsUrlPlugin(): Plugin {
  return {
    name: 'api-ws-url',
    transformIndexHtml(html) {
      const apiBase = process.env.VITE_API_BASE_URL ?? 'http://localhost:8787'
      const wsUrl = apiBase.startsWith('https://')
        ? apiBase.replace('https://', 'wss://')
        : apiBase.replace('http://', 'ws://')
      return html.replaceAll('%VITE_API_WS_URL%', wsUrl)
    },
  }
}

export default defineConfig({
  base: process.env.VITE_BASE_PATH ?? '/',
  plugins: [vue(), tailwindcss(), apiWsUrlPlugin()],
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
    port: 5173,
  },
})
