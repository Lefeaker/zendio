import { defineConfig } from '@playwright/test';

// Explicit standalone measurement: build with the existing build:fast owner first.
// No web server rebuild, retry, tracing, or parallel worker may change the sample.
export default defineConfig({
  testDir: '..',
  testMatch: ['**/realWorkloadPerformance.browser.test.ts'],
  outputDir: '../../../test-results/performance',
  timeout: 300000,
  retries: 0,
  workers: 1,
  fullyParallel: false,
  reporter: 'list'
});
