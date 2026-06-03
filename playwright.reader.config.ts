import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const configuredPort = Number(process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? '4182');
const playwrightReaderPort = Number.isFinite(configuredPort) && configuredPort > 0
  ? configuredPort
  : 4182;
const playwrightReaderBaseUrl = `http://127.0.0.1:${playwrightReaderPort}`;

export default defineConfig({
  testDir: path.join(__dirname, 'tests/e2e'),
  timeout: 60000,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  fullyParallel: false,
  reporter: 'list',
  webServer: {
    command: `PLAYWRIGHT_WEB_SERVER_PORT=${playwrightReaderPort} node scripts/start-playwright-web-server.mjs`,
    url: `${playwrightReaderBaseUrl}/options/index.html`,
    reuseExistingServer: false,
    timeout: 180000
  },
  projects: [
    {
      name: 'chromium-desktop',
      use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1280, height: 720 } }
    }
  ]
});
