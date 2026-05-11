import { getService } from '@shared/di';
import { TOKENS } from '@shared/di/tokens';
import type { PlatformServices } from '@platform/types';
import { requestVaultConnectionTest } from '@options/services/connectionTester';
import type { IMessagingRepository } from '@shared/repositories';
import type { CompleteOptions } from '@shared/types/options';
import type { ConnectionTestResult } from '@shared/types/connection';
import type {
  RoutingRule as StoredRoutingRule,
  RoutingRuleType,
  VaultConfig,
  VaultRouterConfig
} from '@shared/types/vault';
import type { PreviewContent, PreviewStoreState } from '@options/stitch/types';

interface ProductionStitchStorageControllerOptions {
  getConnectionNotice(): PreviewContent['storage']['connectionNotice'] | undefined;
  getDraft(): CompleteOptions;
  getMessagingRepository(): Pick<IMessagingRepository, 'send' | 'onMessage'>;
  getState(): PreviewStoreState;
  setConnectionNotice(notice: PreviewContent['storage']['connectionNotice'] | undefined): void;
  refreshAppData(): void;
  render(): void;
  scheduleDraftSave(): void;
}

export interface ProductionStitchStorageController {
  activateVaultLocalFolder(index: number): Promise<void>;
  applyConnectionNotice(result: ConnectionTestResult): void;
  chooseVaultLocalFolder(index: number): Promise<void>;
  clearVaultLocalFolder(index: number): void;
  ensureVaultRouter(): VaultRouterConfig;
  runVaultListConnectionTest(): Promise<ConnectionTestResult>;
  syncDefaultVaultFromRest(): void;
  syncRoutingRulesToDraft(): void;
  updateVaultField(index: number, field: string, value: unknown): void;
}

export function createProductionStitchStorageController(
  options: ProductionStitchStorageControllerOptions
): ProductionStitchStorageController {
  function ensureVaultRouter(): VaultRouterConfig {
    const draft = options.getDraft();
    if (!draft.vaultRouter?.vaults?.length) {
      draft.vaultRouter = {
        defaultVaultId: 'default',
        vaults: [
          {
            id: 'default',
            name: draft.rest.vault,
            vault: draft.rest.vault,
            ...(draft.rest.localFolderId ? { localFolderId: draft.rest.localFolderId } : {}),
            ...(draft.rest.localFolderName ? { localFolderName: draft.rest.localFolderName } : {}),
            httpsUrl: draft.rest.httpsUrl ?? draft.rest.baseUrl,
            httpUrl: draft.rest.httpUrl ?? draft.rest.baseUrl,
            apiKey: draft.rest.apiKey,
            enabled: true,
            isDefault: true
          }
        ],
        rules: []
      };
    }
    return draft.vaultRouter;
  }

  function syncDefaultRestFromVault(vault: VaultConfig): void {
    const draft = options.getDraft();
    draft.rest.vault = vault.name || vault.vault;
    draft.rest.baseUrl = vault.httpsUrl || vault.httpUrl || draft.rest.baseUrl;
    draft.rest.httpsUrl = vault.httpsUrl;
    draft.rest.httpUrl = vault.httpUrl;
    draft.rest.apiKey = vault.apiKey;
    draft.rest.localFolderId = vault.localFolderId;
    draft.rest.localFolderName = vault.localFolderName;
  }

  function syncDefaultVaultFromRest(): void {
    const draft = options.getDraft();
    const router = ensureVaultRouter();
    const defaultVault =
      router.vaults.find((vault) => vault.id === router.defaultVaultId) ?? router.vaults[0];
    if (!defaultVault) {
      return;
    }
    defaultVault.name = draft.rest.vault;
    defaultVault.vault = draft.rest.vault;
    defaultVault.httpsUrl = draft.rest.httpsUrl ?? draft.rest.baseUrl;
    defaultVault.httpUrl = draft.rest.httpUrl ?? draft.rest.baseUrl;
    defaultVault.apiKey = draft.rest.apiKey;
    defaultVault.localFolderId = draft.rest.localFolderId;
    defaultVault.localFolderName = draft.rest.localFolderName;
    defaultVault.enabled = true;
    defaultVault.isDefault = true;
  }

  async function removeStoredLocalFolder(folderId: string | undefined): Promise<void> {
    if (!folderId) {
      return;
    }
    try {
      await getService<PlatformServices>(TOKENS.platformServices).fileSystemAccess.removeDirectory(
        folderId
      );
    } catch (error) {
      console.warn('[Options] Failed to remove stored local vault folder handle:', error);
    }
  }

  async function chooseVaultLocalFolder(index: number): Promise<void> {
    const draft = options.getDraft();
    const state = options.getState();
    const router = ensureVaultRouter();
    const vault = router.vaults[index];
    if (!vault) {
      return;
    }
    try {
      const previousFolderId = vault.localFolderId;
      const selection = await getService<PlatformServices>(
        TOKENS.platformServices
      ).fileSystemAccess.chooseDirectory({
        suggestedName: vault.name || vault.vault
      });
      state.activeLocalFolderVaultIndex = null;
      vault.localFolderId = selection.id;
      vault.localFolderName = selection.name;
      if (vault.isDefault || vault.id === router.defaultVaultId || index === 0) {
        syncDefaultRestFromVault(vault);
      }
      draft.vaultRouter = router;
      options.scheduleDraftSave();
      options.render();
      if (previousFolderId !== selection.id) {
        void removeStoredLocalFolder(previousFolderId);
      }
    } catch (error) {
      console.warn('[Options] Failed to choose local vault folder:', error);
      options.setConnectionNotice({
        title: '本地目录',
        body: '无法授权本地目录。Chromium 浏览器支持此功能，未授权时会继续使用 REST API。',
        variant: 'warning'
      });
      options.refreshAppData();
      options.render();
    }
  }

  function clearVaultLocalFolder(index: number): void {
    const draft = options.getDraft();
    const state = options.getState();
    const router = ensureVaultRouter();
    const vault = router.vaults[index];
    if (!vault) {
      return;
    }
    const previousFolderId = vault.localFolderId;
    state.activeLocalFolderVaultIndex = null;
    vault.localFolderId = undefined;
    vault.localFolderName = undefined;
    if (vault.isDefault || vault.id === router.defaultVaultId || index === 0) {
      syncDefaultRestFromVault(vault);
    }
    draft.vaultRouter = router;
    options.scheduleDraftSave();
    options.render();
    void removeStoredLocalFolder(previousFolderId);
  }

  async function activateVaultLocalFolder(index: number): Promise<void> {
    const state = options.getState();
    const router = ensureVaultRouter();
    const vault = router.vaults[index];
    if (!vault) {
      return;
    }
    if (!vault.localFolderId) {
      void chooseVaultLocalFolder(index);
      return;
    }

    try {
      const permission = await getService<PlatformServices>(
        TOKENS.platformServices
      ).fileSystemAccess.ensurePermission(vault.localFolderId);
      if (permission !== 'granted') {
        options.setConnectionNotice({
          title: '本地目录需要重新授权',
          body: `Chrome 已将“${vault.localFolderName ?? vault.name ?? vault.vault}”的本地目录权限恢复为待授权状态。请再次点击该目录并在浏览器权限提示中允许读写；未授权前发送会回退 REST API。`,
          variant: 'warning'
        });
        state.activeLocalFolderVaultIndex = null;
        options.refreshAppData();
        options.render();
        return;
      }
      options.setConnectionNotice({
        title: '本地目录权限已确认',
        body: `“${vault.localFolderName ?? vault.name ?? vault.vault}”已可用于本地写入。`,
        variant: 'success'
      });
    } catch (error) {
      console.warn('[Options] Failed to refresh local vault folder permission:', error);
      options.setConnectionNotice({
        title: '本地目录需要重新授权',
        body: 'Chrome 暂时无法恢复这个本地目录权限。请重新选择目录，或继续使用 REST API。',
        variant: 'warning'
      });
      state.activeLocalFolderVaultIndex = null;
      options.refreshAppData();
      options.render();
      return;
    }

    state.activeLocalFolderVaultIndex = state.activeLocalFolderVaultIndex === index ? null : index;
    options.refreshAppData();
    options.render();
  }

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
    const router = ensureVaultRouter();
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
    const router = ensureVaultRouter();
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
      syncDefaultRestFromVault(vault);
    }
    draft.vaultRouter = router;
    options.scheduleDraftSave();
  }

  function applyConnectionNotice(result: ConnectionTestResult): void {
    options.setConnectionNotice({
      title: '连接测试结果',
      body:
        result.message || result.error || (result.success ? '连接测试成功。' : '连接测试失败。'),
      variant: result.success ? 'success' : 'danger'
    });
    options.refreshAppData();
  }

  async function runVaultListConnectionTest(): Promise<ConnectionTestResult> {
    const router = ensureVaultRouter();
    const vaults = router.vaults.filter((vault, index) => {
      return index === 0 || vault.isDefault || vault.enabled !== false;
    });
    if (vaults.length === 0) {
      return {
        success: false,
        message: '没有可测试的启用仓库。',
        error: '没有可测试的启用仓库。'
      };
    }

    const results = await Promise.all(
      vaults.map(async (vault) => {
        try {
          return await requestVaultConnectionTest(vault, options.getMessagingRepository());
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            success: false,
            message: `[${vault.name || vault.vault || vault.id}] ${message}`,
            error: message
          } satisfies ConnectionTestResult;
        }
      })
    );

    const failures = results.filter((result) => !result.success);
    return {
      success: failures.length === 0,
      message: results.map((result) => result.message || result.error || '').join('\n\n'),
      ...(failures.length
        ? {
            error: failures
              .map((result) => result.error || result.message)
              .filter(Boolean)
              .join('\n\n')
          }
        : {})
    };
  }

  return {
    activateVaultLocalFolder,
    applyConnectionNotice,
    chooseVaultLocalFolder,
    clearVaultLocalFolder,
    ensureVaultRouter,
    runVaultListConnectionTest,
    syncDefaultVaultFromRest,
    syncRoutingRulesToDraft,
    updateVaultField
  };
}
