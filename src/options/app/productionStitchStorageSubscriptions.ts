import type { Messages } from '@i18n';
import { resolveSchemaMessage } from '@options/stitch/schema/i18n';
import { getService } from '@shared/di';
import { TOKENS } from '@shared/di/tokens';
import type { PlatformServices } from '@platform/types';
import {
  OptionsMutationError,
  createOptionsMutationRequest,
  isOptionsMutationResponse
} from '@shared/types/optionsMutationMessages';
import type {
  ProductionStitchStorageControllerOptions,
  ProductionStitchStorageLoad
} from './productionStitchStorageTypes';
import {
  classifyPermissionPromptErrorOutcome,
  emitLocalVaultPermissionPrompted,
  emitLocalVaultPermissionResolved
} from '@options/services/connectionTester';

export interface ProductionStitchStorageSubscriptions {
  activateVaultLocalFolder(index: number): Promise<void>;
  chooseVaultLocalFolder(index: number): Promise<void>;
  clearVaultLocalFolder(index: number): Promise<void>;
}

export function createProductionStitchStorageSubscriptions(
  options: ProductionStitchStorageControllerOptions,
  load: ProductionStitchStorageLoad
): ProductionStitchStorageSubscriptions {
  let folderGeneration = 0;
  let mutationSequence = 0;
  function resolveCurrentMessages(): Messages | null {
    return options.getMessages?.() ?? null;
  }

  function getMessage(
    messages: Messages | null,
    key: keyof Messages,
    values: Record<string, string | number | boolean> = {}
  ): string {
    return resolveSchemaMessage(messages, key, values);
  }

  async function persistVaultRouter(
    router: ReturnType<ProductionStitchStorageLoad['ensureVaultRouter']>,
    persistence: { requireWrite?: boolean } = {}
  ): Promise<void> {
    mutationSequence += 1;
    const requestId = `options-vault-${Date.now().toString(36)}-${mutationSequence.toString(36)}`;
    const request = createOptionsMutationRequest(requestId, {
      kind: 'patch',
      patches: [{ path: ['vaultRouter'], value: structuredClone(router) }]
    });
    const response = await options
      .getMessagingRepository()
      .send<Parameters<typeof isOptionsMutationResponse>[0]>(request as never);
    if (!isOptionsMutationResponse(response) || response.requestId !== requestId) {
      throw new OptionsMutationError('INVALID_OPTIONS_MUTATION');
    }
    if (response.success === false) throw new OptionsMutationError(response.errorCode);
    if (persistence.requireWrite && response.result.didWrite !== true) {
      throw new OptionsMutationError('INVALID_OPTIONS_MUTATION');
    }
  }

  async function chooseVaultLocalFolder(index: number): Promise<void> {
    const draft = options.getDraft();
    const state = options.getState();
    const router = load.ensureVaultRouter();
    const vault = router.vaults[index];
    if (!vault) {
      return;
    }
    const generation = ++folderGeneration;
    const isCurrent = () => options.isActive() && generation === folderGeneration;
    try {
      emitLocalVaultPermissionPrompted(options.getMessagingRepository(), 'options');
      const selection = await getService<PlatformServices>(
        TOKENS.platformServices
      ).fileSystemAccess.chooseDirectory({
        suggestedName: vault.name || vault.vault
      });
      if (!isCurrent()) return;
      emitLocalVaultPermissionResolved(options.getMessagingRepository(), 'completed');
      state.activeLocalFolderVaultIndex = null;
      vault.localFolderId = selection.id;
      vault.localFolderName = selection.name;
      if (vault.isDefault || vault.id === router.defaultVaultId || index === 0) {
        load.syncDefaultRestFromVault(vault);
      }
      draft.vaultRouter = router;
      options.refreshAppData();
      options.render('storage');
      await persistVaultRouter(router);
    } catch (error) {
      if (!isCurrent()) return;
      const messages = resolveCurrentMessages();
      emitLocalVaultPermissionResolved(
        options.getMessagingRepository(),
        classifyPermissionPromptErrorOutcome(error)
      );
      console.warn('[Options] Failed to choose local vault folder:', error);
      options.setConnectionNotice({
        title: getMessage(messages, 'schemaStorageLocalFolderAuthorizeWarningTitle'),
        body: getMessage(messages, 'schemaStorageLocalFolderAuthorizeWarningBody'),
        variant: 'warning'
      });
      options.refreshAppData();
      options.render('storage');
    }
  }

  async function clearVaultLocalFolder(index: number): Promise<void> {
    const generation = ++folderGeneration;
    const draft = options.getDraft();
    const state = options.getState();
    const router = load.ensureVaultRouter();
    const vault = router.vaults[index];
    if (!vault) {
      return;
    }
    const previous = {
      activeLocalFolderVaultIndex: state.activeLocalFolderVaultIndex ?? null,
      localFolderId: vault.localFolderId,
      localFolderName: vault.localFolderName
    };
    state.activeLocalFolderVaultIndex = null;
    vault.localFolderId = undefined;
    vault.localFolderName = undefined;
    if (vault.isDefault || vault.id === router.defaultVaultId || index === 0) {
      load.syncDefaultRestFromVault(vault);
    }
    draft.vaultRouter = router;
    options.refreshAppData();
    options.render('storage');
    try {
      await persistVaultRouter(router, { requireWrite: true });
    } catch (error) {
      if (generation === folderGeneration) {
        state.activeLocalFolderVaultIndex = previous.activeLocalFolderVaultIndex;
        vault.localFolderId = previous.localFolderId;
        vault.localFolderName = previous.localFolderName;
        if (vault.isDefault || vault.id === router.defaultVaultId || index === 0) {
          load.syncDefaultRestFromVault(vault);
        }
        draft.vaultRouter = router;
        options.refreshAppData();
      }
      throw error;
    }
  }

  async function activateVaultLocalFolder(index: number): Promise<void> {
    const state = options.getState();
    const router = load.ensureVaultRouter();
    const vault = router.vaults[index];
    if (!vault) {
      return;
    }
    if (!vault.localFolderId) {
      void chooseVaultLocalFolder(index);
      return;
    }
    const generation = ++folderGeneration;
    const isCurrent = () => options.isActive() && generation === folderGeneration;

    state.activeLocalFolderVaultIndex = state.activeLocalFolderVaultIndex === index ? null : index;
    options.render('storage');

    try {
      emitLocalVaultPermissionPrompted(options.getMessagingRepository(), 'options');
      const permission = await getService<PlatformServices>(
        TOKENS.platformServices
      ).fileSystemAccess.ensurePermission(vault.localFolderId);
      if (!isCurrent()) return;
      const messages = resolveCurrentMessages();
      emitLocalVaultPermissionResolved(
        options.getMessagingRepository(),
        permission === 'granted' ? 'completed' : 'failed'
      );
      if (permission !== 'granted') {
        options.setConnectionNotice({
          title: getMessage(messages, 'schemaStorageLocalFolderReauthorizeTitle'),
          body: getMessage(messages, 'schemaStorageLocalFolderReauthorizeBody', {
            vaultName: vault.localFolderName ?? vault.name ?? vault.vault
          }),
          variant: 'warning'
        });
        options.refreshAppData();
        options.render('storage');
        return;
      }
      options.setConnectionNotice({
        title: getMessage(messages, 'schemaStorageLocalFolderPermissionConfirmedTitle'),
        body: getMessage(messages, 'schemaStorageLocalFolderPermissionConfirmedBody', {
          vaultName: vault.localFolderName ?? vault.name ?? vault.vault
        }),
        variant: 'success'
      });
    } catch (error) {
      if (!isCurrent()) return;
      const messages = resolveCurrentMessages();
      emitLocalVaultPermissionResolved(
        options.getMessagingRepository(),
        classifyPermissionPromptErrorOutcome(error)
      );
      console.warn('[Options] Failed to refresh local vault folder permission:', error);
      options.setConnectionNotice({
        title: getMessage(messages, 'schemaStorageLocalFolderReauthorizeTitle'),
        body: getMessage(messages, 'schemaStorageLocalFolderReauthorizeFallbackBody'),
        variant: 'warning'
      });
      options.refreshAppData();
      options.render('storage');
      return;
    }

    options.refreshAppData();
    options.render('storage');
  }

  return {
    activateVaultLocalFolder,
    chooseVaultLocalFolder,
    clearVaultLocalFolder
  };
}
