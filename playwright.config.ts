import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const includeFirefoxProject = process.env.PLAYWRIGHT_INCLUDE_FIREFOX === '1';
const firefoxExecutablePath = process.env.PLAYWRIGHT_FIREFOX_EXECUTABLE_PATH;
const configuredWorkers = Number(process.env.PLAYWRIGHT_WORKERS ?? '1');
const workers = Number.isFinite(configuredWorkers) && configuredWorkers > 0 ? configuredWorkers : 1;
const configuredPort = Number(process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? '4181');
const playwrightVisualPort =
  Number.isFinite(configuredPort) && configuredPort > 0 ? configuredPort : 4181;
const playwrightVisualBaseUrl = `http://127.0.0.1:${playwrightVisualPort}`;
const playwrightOutputDir = process.env.PLAYWRIGHT_OUTPUT_DIR
  ? path.resolve(__dirname, process.env.PLAYWRIGHT_OUTPUT_DIR)
  : path.join(__dirname, 'tests/visual/__output__');
const playwrightHtmlReportDir = process.env.PLAYWRIGHT_HTML_REPORT_DIR
  ? path.resolve(__dirname, process.env.PLAYWRIGHT_HTML_REPORT_DIR)
  : path.join('build', 'reports', 'playwright');

export default defineConfig({
  testDir: path.join(__dirname, 'tests/visual'),
  snapshotDir: path.join(__dirname, 'tests/visual/__snapshots__'),
  outputDir: playwrightOutputDir,
  timeout: 60000,
  retries: process.env.CI ? 1 : 0,
  workers,
  fullyParallel: false,
  reporter: process.env.CI
    ? [
        ['list'],
        ['html', { open: 'never', outputFolder: playwrightHtmlReportDir }]
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
    command: `PLAYWRIGHT_WEB_SERVER_PORT=${playwrightVisualPort} node scripts/start-playwright-web-server.mjs`,
    url: `${playwrightVisualBaseUrl}/options/index.html`,
    reuseExistingServer: false,
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
