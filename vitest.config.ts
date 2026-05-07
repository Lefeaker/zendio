import { defineConfig } from 'vitest/config';
import { createVitestAliases } from './vitest.shared';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**/*.browser.test.ts']
  },
  resolve: {
    alias: createVitestAliases()
  }
});
