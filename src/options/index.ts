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

if ((document.body?.dataset.route ?? 'options') === 'options') {
  const run = async () => {
    const platformServices: PlatformServices | undefined = hasChromeStorage()
      ? getPlatformServices()
      : undefined;
    const { bootstrapOptionsRuntime } = await import('./runtimeEntry');
    await bootstrapOptionsRuntime(platformServices);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void run(), { once: true });
  } else {
    void run();
  }
}
