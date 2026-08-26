import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, devices } from '@playwright/test';
import visualConfig from './playwright.config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  ...visualConfig,
  testDir: path.join(__dirname, 'tests'),
  testMatch: [
    '**/tests/e2e/optionsCrossContextMutation.browser.test.ts',
    '**/tests/e2e/sessionDraftConcurrency.browser.test.ts',
    '**/tests/e2e/uiPrimitiveTokenParity.browser.test.ts',
    '**/tests/e2e/videoScreenshotCacheMigration.browser.test.ts',
    '**/tests/visual/options.stitch-secondary.parity.spec.ts',
    '**/tests/visual/preview.runtime.alignment.spec.ts',
    '**/tests/visual/preview.task-success.layout.spec.ts',
    '**/tests/visual/migration-harness.spec.ts'
  ],
  projects: [
    {
      name: 'chromium-desktop',
      use: {
        ...devices['Desktop Chrome'],
        browserName: 'chromium',
        viewport: { width: 1280, height: 720 }
      }
    }
  ]
});
