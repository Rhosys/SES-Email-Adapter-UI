import { defineConfig, devices } from '@playwright/test'
import { VIEWPORTS } from './tests/viewports'

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'laptop', use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS.laptop } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS.desktop } },
    { name: 'tablet', use: { viewport: VIEWPORTS.tablet } },
    { name: 'narrow', use: { viewport: VIEWPORTS.narrow } },
    { name: 'pixel', use: { ...devices['Pixel 7'], viewport: VIEWPORTS.pixel } },
    { name: 'mobile', use: { ...devices['iPhone 14'], viewport: VIEWPORTS.mobile } },
    // PWA installability checks run once on Chromium against their own test
    // folder, so they don't fan out across the viewport projects above.
    {
      name: 'pwa',
      testDir: 'tests/pwa-e2e',
      use: { ...devices['Desktop Chrome'], viewport: VIEWPORTS.laptop },
    },
  ],
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
