import type { StorageService } from '@platform/interfaces/storage';
import type { RuntimeService } from '@platform/interfaces/runtime';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { Language, Messages } from '@i18n';
import type { PreviewContent, SchemaContext, ViewSchema } from '@options/stitch/types';
import type { OptionsController } from './optionsController';
import type { MountedDraftRebase } from './optionsDraftSession';
import type { ProductionStitchAssetUrlResolver } from './productionStitchAssetUrlResolver';
import type { UsageStatsClientLike } from './usage-dashboard/usageStatsClient';

export interface MountedProductionStitchShell {
  cleanup(): void;
  collectDraft(): CompleteOptions;
  rebaseOptions(options: CompleteOptions, transition: MountedDraftRebase): void;
  refreshOptions(options?: StoredOptions | CompleteOptions | null): void;
  setMessages(messages: Messages | null, language: Language): void;
}

export interface ProductionStitchShellDependencies {
  root?: HTMLElement | null;
  controller: OptionsController;
  initialOptions?: StoredOptions | CompleteOptions | null;
  previewContent?: PreviewContent;
  getFooterMeta?: (id: string) => { openMode: 'modal' | 'page'; href?: string } | null;
  getFooterView?: (id: string, ctx: SchemaContext) => ViewSchema | null;
  getSettingsView?: (id: string, ctx: SchemaContext) => ViewSchema | null;
  messages?: Messages | null;
  language: Language;
  changeLanguage?: (
    language: Language
  ) => Promise<{ messages: Messages | null; language: Language }>;
  optionsRepository?: Pick<IOptionsRepository, 'get' | 'patch' | 'replace' | 'onChange'>;
  messagingRepository?: Pick<IMessagingRepository, 'send' | 'onMessage'>;
  usageStatsClient?: UsageStatsClientLike;
  storage?: StorageService;
  runtime?: Pick<RuntimeService, 'getURL' | 'getBrowserTarget'>;
  resolveAssetUrl?: ProductionStitchAssetUrlResolver;
  browserTarget?: SchemaContext['browserTarget'];
  now?: () => number;
}
