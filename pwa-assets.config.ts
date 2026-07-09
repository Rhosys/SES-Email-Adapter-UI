import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Build-time PWA icon generation. The single source image (the existing vector
// favicon) is rasterized by vite-plugin-pwa during `vite build` into the PNG,
// maskable, and apple-touch icons Android needs for installation. The generated
// files land in dist/ only — none of them are committed to git.
//
// The maskable + apple icons are edge-filled (Android masks the maskable icon
// into a circle/squircle, and iOS forbids transparency), and the generator's
// default fill colour is WHITE. Against our dark backgrounds that shows up as a
// white square behind the logo — Chrome uses the maskable icon for the PWA
// splash screen, whose background is #1e1e2e. Fill both with the brand base
// colour instead so the icon blends seamlessly. The transparent `any` icons are
// unaffected (they keep their alpha channel).
const BRAND_BACKGROUND = '#1e1e2e'

export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: {
      ...minimal2023Preset.maskable,
      resizeOptions: { ...minimal2023Preset.maskable.resizeOptions, background: BRAND_BACKGROUND },
    },
    apple: {
      ...minimal2023Preset.apple,
      resizeOptions: { ...minimal2023Preset.apple.resizeOptions, background: BRAND_BACKGROUND },
    },
  },
  images: ['public/favicon.svg'],
})
