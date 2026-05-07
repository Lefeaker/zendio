import { defineConfig } from 'vitest/config';
import { createVitestAliases } from './vitest.shared';

export default defineConfig({
  resolve: {
    alias: createVitestAliases()
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/e2e/**/*.test.ts'],
    exclude: ['tests/e2e/readerPanelFlow.test.ts', 'tests/e2e/**/*.browser.test.ts'],
    setupFiles: ['tests/e2e/setup.ts'],
    // Disable file parallelism to prevent state pollution in harness
    fileParallelism: false
  }
});
