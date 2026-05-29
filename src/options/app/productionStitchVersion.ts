import { getService, hasService, TOKENS } from '@shared/di';
import type { PlatformServices } from '@platform/types';

const PACKAGE_VERSION = '0.2.0';

type ExtensionVersionReader = () => string | undefined;

function readPlatformManifestVersion(): string | undefined {
  if (!hasService(TOKENS.platformServices)) {
    return undefined;
  }
  return getService<PlatformServices>(TOKENS.platformServices).runtime.getManifest?.()?.version;
}

export function resolveExtensionVersionLabel(
  readVersion: ExtensionVersionReader = readPlatformManifestVersion
): string {
  try {
    const version = readVersion();
    if (typeof version === 'string' && version.trim().length > 0) {
      return `v${version.trim()}`;
    }
  } catch {
    // Platform services can be unavailable in isolated preview or unit-test contexts.
  }
  return `v${PACKAGE_VERSION}`;
}
