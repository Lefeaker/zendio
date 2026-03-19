import type { RestOptions } from '../../shared/types/options';
import type { VaultConfig } from '../../shared/types';

export interface PortUsageEntry {
  id: string;
  port: string;
}

const PORT_PATTERN = /:(\d{2,5})(?:[/?#]|$)/;

export function extractPort(value?: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  try {
    const normalized = trimmed.includes('://') ? trimmed : `https://${trimmed}`;
    const url = new URL(normalized);
    if (url.port) {
      return url.port;
    }
  } catch {
    // Ignore parsing errors and fall back to regex extraction below.
  }

  const match = trimmed.match(PORT_PATTERN);
  return match ? match[1] : null;
}

export function collectPortEntriesFromConfig(
  rest?: Partial<RestOptions> | null,
  vaults?: VaultConfig[] | null
): PortUsageEntry[] {
  const entries: PortUsageEntry[] = [];

  addPortEntry(entries, rest?.httpsUrl, '__default__');
  addPortEntry(entries, rest?.httpUrl, '__default__');

  (vaults ?? [])
    .filter(vault => vault.enabled !== false)
    .forEach((vault, index) => {
      const vaultId = vault.id ?? `vault-${index}`;
      addPortEntry(entries, vault.httpsUrl, vaultId);
      addPortEntry(entries, vault.httpUrl, vaultId);
    });

  return entries;
}

export function findDuplicatePorts(entries: PortUsageEntry[], targetId?: string): string[] {
  const duplicates = new Set<string>();
  const usage = new Map<string, Set<string>>();

  entries.forEach(entry => {
    if (!entry.port) {
      return;
    }

    if (!usage.has(entry.port)) {
      usage.set(entry.port, new Set());
    }

    const ids = usage.get(entry.port);
    if (ids) {
      ids.add(entry.id);
    }
  });

  usage.forEach((ids, port) => {
    if (ids.size > 1 && (!targetId || ids.has(targetId))) {
      duplicates.add(port);
    }
  });

  return Array.from(duplicates).sort((a, b) => Number(a) - Number(b));
}

function addPortEntry(entries: PortUsageEntry[], url: string | undefined | null, id: string): void {
  const port = extractPort(url);
  if (!port) {
    return;
  }

  entries.push({ id, port });
}
