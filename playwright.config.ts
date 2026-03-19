import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  testDir: path.join(__dirname, 'tests/visual'),
  snapshotDir: path.join(__dirname, 'tests/visual/__snapshots__'),
  outputDir: path.join(__dirname, 'tests/visual/__output__'),
  retries: process.env.CI ? 1 : 0,
  fullyParallel: false,
  reporter: process.env.CI
    ? [
        ['list'],
        ['html', { open: 'never', outputFolder: path.join('build', 'reports', 'playwright') }]
      ]
    : 'list',
  use: {
    browserName: 'chromium',
    viewport: { width: 1280, height: 720 },
    deviceScaleFactor: 1,
    trace: 'retain-on-failure',
    video: 'off',
    screenshot: 'only-on-failure',
    colorScheme: 'light'
  },
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.003,
      maxDiffPixels: 150
    }
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 } }
    },
    {
      name: 'chromium-tablet',
      use: { ...devices['iPad (gen 7)'] }
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 5'] }
    }
  ]
});
