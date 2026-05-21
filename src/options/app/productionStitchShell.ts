import type { StorageService } from '@platform/interfaces/storage';
import type { IOptionsRepository, IMessagingRepository } from '@shared/repositories';
import type { CompleteOptions, StoredOptions } from '@shared/types/options';
import type { Language, Messages } from '@i18n';
import type { OptionsController } from './optionsController';
import { mountProductionStitchShellFromDependencies } from './productionStitchShellMount';

export interface MountedProductionStitchShell {
  cleanup(): void;
  collectDraft(): CompleteOptions;
  refreshOptions(options?: StoredOptions | CompleteOptions | null): void;
  setMessages(messages: Messages | null, language: Language): void;
}

export interface ProductionStitchShellDependencies {
  root?: HTMLElement | null;
  controller: OptionsController;
  initialOptions?: StoredOptions | CompleteOptions | null;
  messages?: Messages | null;
  language: Language;
  changeLanguage?: (
    language: Language
  ) => Promise<{ messages: Messages | null; language: Language }>;
  optionsRepository?: Pick<IOptionsRepository, 'get' | 'set' | 'onChange'>;
  messagingRepository?: Pick<IMessagingRepository, 'send' | 'onMessage'>;
  storage?: StorageService;
  now?: () => number;
}

export function mountProductionStitchShell(
  dependencies: ProductionStitchShellDependencies
): MountedProductionStitchShell {
  return mountProductionStitchShellFromDependencies(dependencies);
}
