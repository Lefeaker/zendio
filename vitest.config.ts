import { defineConfig } from 'vitest/config';
import { createVitestAliases } from './vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['tests/setup/i18nAssetFetch.ts'],
    include: ['tests/**/*.test.ts'],
    exclude: [
      'tests/e2e/readerPanelFlow.test.ts',
      'tests/e2e/videoPanelFlow.test.ts',
      'tests/e2e/**/*.browser.test.ts'
    ]
  },
  resolve: {
    alias: createVitestAliases()
  }
});
