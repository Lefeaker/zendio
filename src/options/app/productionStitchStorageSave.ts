import type {
  RoutingRule as StoredRoutingRule,
  RoutingRuleType,
  VaultRouterConfig
} from '@shared/types/vault';
import type { ProductionStitchStorageControllerOptions } from './productionStitchStorageController';
import type { ProductionStitchStorageLoad } from './productionStitchStorageLoad';

export interface ProductionStitchStorageSave {
  syncRoutingRulesToDraft(): void;
  updateVaultField(index: number, field: string, value: unknown): void;
}

export function createProductionStitchStorageSave(
  options: ProductionStitchStorageControllerOptions,
  load: ProductionStitchStorageLoad
): ProductionStitchStorageSave {
  function toStoredRuleType(type: string): RoutingRuleType {
    if (type === 'URL Pattern') {
      return 'url-pattern';
    }
    if (type === 'Keyword') {
      return 'keyword';
    }
    return 'domain';
  }

  function resolveVaultIdByLabel(label: string, router: VaultRouterConfig): string {
    const matched = router.vaults.find((vault) =>
      [vault.id, vault.name, vault.vault].filter(Boolean).includes(label)
    );
    return matched?.id ?? router.defaultVaultId ?? router.vaults[0]?.id ?? 'default';
  }

  function syncRoutingRulesToDraft(): void {
    const draft = options.getDraft();
    const router = load.ensureVaultRouter();
    const existingRules = router.rules ?? [];
    router.rules = options.getState().routingRules.map(
      (rule, index): StoredRoutingRule => ({
        id: existingRules[index]?.id ?? `rule-${index + 1}`,
        vaultId: resolveVaultIdByLabel(rule.target, router),
        type: toStoredRuleType(rule.type),
        pattern: rule.pattern,
        enabled: Boolean(rule.enabled),
        priority: Number(rule.priority) || 0
      })
    );
    router.vaults = router.vaults.map((vault) => ({ ...vault, rules: [] }));
    draft.vaultRouter = router;
  }

  function updateVaultField(index: number, field: string, value: unknown): void {
    const draft = options.getDraft();
    const router = load.ensureVaultRouter();
    const vault = router.vaults[index];
    if (!vault) {
      return;
    }
    switch (field) {
      case 'enabled':
        vault.enabled = Boolean(value);
        break;
      case 'name':
        vault.name = String(value ?? '');
        vault.vault = vault.name;
        break;
      case 'https':
        vault.httpsUrl = String(value ?? '');
        break;
      case 'http':
        vault.httpUrl = String(value ?? '');
        break;
      case 'key':
        vault.apiKey = String(value ?? '');
        break;
      default:
        return;
    }
    if (vault.isDefault || vault.id === router.defaultVaultId || index === 0) {
      load.syncDefaultRestFromVault(vault);
    }
    draft.vaultRouter = router;
    options.scheduleDraftSave();
  }

  return {
    syncRoutingRulesToDraft,
    updateVaultField
  };
}
