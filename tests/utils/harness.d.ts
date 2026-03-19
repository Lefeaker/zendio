import type { TestPlatformHarness } from './platformTestHarness';

declare global {
  // eslint-disable-next-line no-var
  var __testPlatformHarness: TestPlatformHarness | undefined;
}
