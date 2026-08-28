import type { AnalyticsRuntimeEventPayload } from '@shared/types/analytics';
import type { IMessagingRepository, IOptionsRepository } from '@shared/repositories';
import type { ConnectionTestResult } from '@shared/types/connection';
import type { CompleteOptions } from '@shared/types/options';
import type { VaultConfig, VaultRouterConfig } from '@shared/types/vault';
import type { Messages } from '@i18n';
import type { PreviewContent, PreviewStoreState } from '@options/stitch/types';
import type { SectionInvalidationRequest } from '@ui/stitch-runtime/render/sectionInvalidation';
import type { OptionsController } from './optionsController';
import type { UsageStatsClientLike } from './usage-dashboard/usageStatsClient';

export type PrivacyPreferenceField = 'analytics' | 'errorReporting' | 'debugMode';

export interface ProductionStitchPersistenceOptions {
  controller: OptionsController;
  optionsRepository: Pick<IOptionsRepository, 'get' | 'patch' | 'replace' | 'onChange'>;
  messagingRepository: Pick<IMessagingRepository, 'send' | 'onMessage'>;
  usageStatsClient: UsageStatsClientLike;
  now?: () => number;
  getAppData(): PreviewContent;
  getCurrentMessages(): Messages | null;
  getDraft(): CompleteOptions;
  getState(): PreviewStoreState;
  isActive(): boolean;
  installImportedOptions(options: CompleteOptions): void;
  setAppData(appData: PreviewContent): void;
  setMaintenanceLog(log: string): void;
  collectDraftWithWidgets(): CompleteOptions;
  refreshAppData(): void;
  render(scopes: SectionInvalidationRequest): void;
  syncDefaultVaultFromRest(): void;
}

export interface ProductionStitchPersistence {
  clearAnalyticsPrivacyData(): Promise<void>;
  copyConfigurationToClipboard(button: HTMLButtonElement | null): Promise<void>;
  importConfigurationWithStatus(button: HTMLButtonElement | null): Promise<void>;
  loadUsageStatsFromStorage(): Promise<void>;
  persistPrivacyPreference(field: PrivacyPreferenceField, value: boolean): Promise<void>;
  repairConfiguration(): Promise<void>;
  resetUsageData(): Promise<void>;
  restoreUsageStatsView(): void;
  trackUsageEvent(message: AnalyticsRuntimeEventPayload): Promise<void>;
}

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
