import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const includeFirefoxProject = process.env.PLAYWRIGHT_INCLUDE_FIREFOX === '1';
const firefoxExecutablePath = process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH;
const configuredWorkers = Number(process.env.PLAYWRIGHT_WORKERS ?? '1');
const workers = Number.isFinite(configuredWorkers) && configuredWorkers > 0 ? configuredWorkers : 1;

export default defineConfig({
  testDir: path.join(__dirname, 'tests/visual'),
  snapshotDir: path.join(__dirname, 'tests/visual/__snapshots__'),
  outputDir: path.join(__dirname, 'tests/visual/__output__'),
  timeout: 60000,
  retries: process.env.CI ? 1 : 0,
  workers,
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
  webServer: {
    command: 'node scripts/start-playwright-web-server.mjs',
    url: 'http://127.0.0.1:4173/options/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 180000
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1280, height: 720 } }
    },
    {
      name: 'chromium-tablet',
      use: { ...devices['iPad (gen 7)'], channel: 'chrome' }
    },
    {
      name: 'chromium-mobile',
      use: { ...devices['Pixel 5'], channel: 'chrome' }
    },
    ...(includeFirefoxProject
        ? [
          {
            name: 'firefox-desktop',
            use: {
              browserName: 'firefox',
              ...(firefoxExecutablePath
                ? {
                    launchOptions: {
                      executablePath: firefoxExecutablePath
                    }
                  }
                : {}),
              viewport: { width: 1280, height: 720 }
            }
          }
        ]
      : [])
  ]
});
