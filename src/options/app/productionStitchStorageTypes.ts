import type { IMessagingRepository } from '@shared/repositories';
import type { ConnectionTestResult } from '@shared/types/connection';
import type { CompleteOptions } from '@shared/types/options';
import type { VaultConfig, VaultRouterConfig } from '@shared/types/vault';
import type { Messages } from '@i18n';
import type { PreviewContent, PreviewStoreState } from '@options/stitch/types';
import type { SectionInvalidationRequest } from '@ui/stitch-runtime/render/sectionInvalidation';

export interface ProductionStitchStorageControllerOptions {
  getConnectionNotice(): PreviewContent['storage']['connectionNotice'] | undefined;
  getDraft(): CompleteOptions;
  getMessagingRepository(): Pick<IMessagingRepository, 'send' | 'onMessage'>;
  getMessages?(): Messages | null;
  getState(): PreviewStoreState;
  isActive(): boolean;
  setConnectionNotice(notice: PreviewContent['storage']['connectionNotice'] | undefined): void;
  refreshAppData(): void;
  render(scopes: SectionInvalidationRequest): void;
  scheduleDraftSave(): void;
}

export interface ProductionStitchStorageController {
  activateVaultLocalFolder: (index: number) => Promise<void>;
  applyConnectionNotice: (result: ConnectionTestResult) => void;
  chooseVaultLocalFolder: (index: number) => Promise<void>;
  clearVaultLocalFolder: (index: number) => void;
  ensureVaultRouter: () => VaultRouterConfig;
  runVaultListConnectionTest: () => Promise<ConnectionTestResult>;
  syncDefaultVaultFromRest: () => void;
  syncRoutingRulesToDraft: () => void;
  updateVaultField: (index: number, field: string, value: unknown) => void;
}

export interface ProductionStitchStorageLoad {
  ensureVaultRouter(): VaultRouterConfig;
  syncDefaultRestFromVault(vault: VaultConfig): void;
  syncDefaultVaultFromRest(): void;
}
