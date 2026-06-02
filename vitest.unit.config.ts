import { defineConfig } from 'vitest/config';
import { createVitestAliases } from './vitest.shared';

export default defineConfig({
  resolve: {
    alias: createVitestAliases({ includeLegacySrcPattern: true })
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    setupFiles: ['tests/setup/globalSetup.ts'],
    pool: 'threads',
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/dev/**',
        'src/**/__tests__/**',
        'src/**/types.ts',
        'src/**/index.ts',
        'src/options/widgets/shared/**',
        'src/styles/**'
      ],
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 80,
        branches: 75
      }
    }
  }
});
