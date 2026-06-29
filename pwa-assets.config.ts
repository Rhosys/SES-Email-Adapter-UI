import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Build-time PWA icon generation. The single source image (the existing vector
// favicon) is rasterized by vite-plugin-pwa during `vite build` into the PNG,
// maskable, and apple-touch icons Android needs for installation. The generated
// files land in dist/ only — none of them are committed to git.
export default defineConfig({
  preset: minimal2023Preset,
  images: ['public/favicon.svg'],
})
