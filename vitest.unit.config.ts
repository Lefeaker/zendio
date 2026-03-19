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
    poolOptions: {
      threads: {
        maxThreads: 1,
        minThreads: 1
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'lcov'],
      reportsDirectory: 'coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        'src/**/__tests__/**',
        'src/**/types.ts',
        'src/**/index.ts',
        'src/options/styles/**',
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
