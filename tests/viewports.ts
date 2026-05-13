export const VIEWPORTS = {
  pixel: { width: 412, height: 915 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1280, height: 800 },
  desktop: { width: 1920, height: 1080 },
} as const

export type ViewportName = keyof typeof VIEWPORTS
