import { getService, hasService, TOKENS } from '@shared/di';
import type { PlatformServices } from '@platform/types';

const UNKNOWN_VERSION_LABEL = 'v0.0.0';

type ExtensionVersionReader = () => string | undefined;

function readPlatformManifestVersion(): string | undefined {
  if (!hasService(TOKENS.platformServices)) {
    return undefined;
  }
  return getService<PlatformServices>(TOKENS.platformServices).runtime.getManifest?.()?.version;
}

function readBuildVersion(): string | undefined {
  if (typeof __ZENDIO_EXTENSION_VERSION__ === 'string') {
    return __ZENDIO_EXTENSION_VERSION__;
  }

  if (typeof __AIIINOB_EXTENSION_VERSION__ === 'string') {
    return __AIIINOB_EXTENSION_VERSION__;
  }

  return undefined;
}

function formatVersionLabel(version: string | undefined): string | undefined {
  const normalized = version?.trim();
  return normalized ? `v${normalized}` : undefined;
}

export function resolveExtensionVersionLabel(
  readVersion: ExtensionVersionReader = readPlatformManifestVersion
): string {
  try {
    return (
      formatVersionLabel(readVersion()) ??
      formatVersionLabel(readBuildVersion()) ??
      UNKNOWN_VERSION_LABEL
    );
  } catch {
    // Platform services can be unavailable in isolated preview or unit-test contexts.
  }
  return formatVersionLabel(readBuildVersion()) ?? UNKNOWN_VERSION_LABEL;
}
