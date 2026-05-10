import { bootstrapPage } from '@options/app/routing';
import { getPlatformServices } from '../platform';
import type { PlatformServices } from '../platform/types';

function hasChromeStorage(): boolean {
  return (
    typeof chrome !== 'undefined' &&
    Boolean(chrome.runtime) &&
    Boolean(chrome.storage?.sync) &&
    Boolean(chrome.storage?.local)
  );
}

bootstrapPage('options', async () => {
  const platformServices: PlatformServices | undefined = hasChromeStorage()
    ? getPlatformServices()
    : undefined;
  const { bootstrapOptionsRuntime } = await import('./runtimeEntry');
  await bootstrapOptionsRuntime(platformServices);
});
