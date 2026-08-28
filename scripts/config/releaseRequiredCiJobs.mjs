export const RELEASE_REQUIRED_CI_JOBS_SCHEMA = 'zendio-release-required-ci-jobs-v1';

export const RELEASE_REQUIRED_CI_JOBS = Object.freeze([
  'Static preflight',
  'Static release surface',
  'Static generated artifacts',
  'Static style and locale audits',
  'Static reporting audits',
  'Unit coverage',
  'Visual regression (chromium-desktop)',
  'Visual regression (chromium-tablet)',
  'Visual regression (chromium-mobile)',
  'E2E Vitest',
  'Browser YAML flow',
  'Browser reader panel flow',
  'Browser smoke flow',
  'Browser video flow',
  'Browser Firefox flow',
  'Browser state flow',
  'Browser architecture flow',
  'Package extension'
]);

export default RELEASE_REQUIRED_CI_JOBS;
