import type { CompleteOptions } from '@shared/types/options';
import type { RoutingRule, VaultRecord } from '@options/stitch/types';

export function toVaultRecord(options: CompleteOptions): VaultRecord[] {
  const routerVaults = options.vaultRouter?.vaults ?? [];
  if (routerVaults.length) {
    const defaultVaultId = options.vaultRouter?.defaultVaultId;
    return routerVaults.map((vault) => {
      const isDefault = Boolean(vault.isDefault || vault.id === defaultVaultId);
      return {
        id: vault.id,
        name: vault.name || vault.vault,
        ...(vault.localFolderId ? { localFolderId: vault.localFolderId } : {}),
        ...(vault.localFolderName ? { localFolderName: vault.localFolderName } : {}),
        https: vault.httpsUrl,
        http: vault.httpUrl,
        key: vault.apiKey,
        enabled: isDefault ? true : (vault.enabled ?? true),
        isDefault
      };
    });
  }

  return [
    {
      id: 'default',
      name: options.rest.vault,
      ...(options.rest.localFolderId ? { localFolderId: options.rest.localFolderId } : {}),
      ...(options.rest.localFolderName ? { localFolderName: options.rest.localFolderName } : {}),
      https: options.rest.httpsUrl ?? options.rest.baseUrl,
      http: options.rest.httpUrl ?? options.rest.baseUrl,
      key: options.rest.apiKey,
      enabled: true,
      isDefault: true
    }
  ];
}

export function toRoutingRules(options: CompleteOptions): RoutingRule[] {
  const vaultById = new Map((options.vaultRouter?.vaults ?? []).map((vault) => [vault.id, vault]));
  const seenIds = new Set<string>();
  const seen = new Set<string>();
  const rules = [
    ...(options.vaultRouter?.rules ?? []),
    ...(options.vaultRouter?.vaults ?? []).flatMap((vault) => vault.rules ?? [])
  ].filter((rule) => {
    const canonicalKey = [
      rule.type,
      rule.pattern.trim().toLowerCase(),
      rule.vaultId,
      rule.priority,
      rule.enabled
    ].join('\u0000');
    const duplicate = seen.has(canonicalKey) || (rule.id ? seenIds.has(rule.id) : false);
    if (rule.id) {
      seenIds.add(rule.id);
    }
    seen.add(canonicalKey);
    return !duplicate;
  });

  return rules.map((rule) => ({
    type:
      rule.type === 'url-pattern' ? 'URL Pattern' : rule.type === 'keyword' ? 'Keyword' : 'Domain',
    pattern: rule.pattern,
    target:
      vaultById.get(rule.vaultId)?.name ?? vaultById.get(rule.vaultId)?.vault ?? options.rest.vault,
    priority: rule.priority,
    enabled: rule.enabled
  }));
}
