import type { Messages, PageI18nController } from '../../i18n';
import type { FragmentClipperOptions } from '../../shared/types/options';
import type { StorageService } from '../../platform/interfaces/storage';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import { ensureContentI18n, getContentI18nResource, getContentMessages } from '../i18n/context';
import { DEFAULT_FRAGMENT_CONFIG, loadFragmentConfig } from '../clipper/services/fragmentConfig';
import { DEFAULT_SESSION_MESSAGES, type ReaderSessionMessages } from './sessionMessages';

function mapMessagesFromLocale(msgs: Messages | null | undefined): ReaderSessionMessages {
  if (!msgs) {
    return DEFAULT_SESSION_MESSAGES;
  }
  return {
    panel: {
      title: msgs.readerPanelTitle,
      status: msgs.readerPanelStatus,
      counter: msgs.readerPanelCounter,
      counterZero: msgs.readerPanelCounterZero,
      finish: msgs.readerPanelFinish,
      cancel: msgs.readerPanelCancel,
      hint: msgs.readerPanelHint,
      highlightEditLabel: msgs.readerHighlightEditLabel,
      highlightDeleteLabel: msgs.readerHighlightDeleteLabel,
      highlightNoComment: msgs.readerHighlightNoComment,
      highlightSaveLabel: msgs.readerHighlightSaveLabel,
      highlightCancelLabel: msgs.readerHighlightCancelLabel,
      highlightEditPlaceholder: msgs.readerHighlightEditPlaceholder,
      highlightFocusLabel: msgs.readerHighlightFocusLabel
    },
    hintNoHighlights: msgs.readerHintNoHighlights,
    hintExporting: msgs.readerHintExporting,
    hintFailure: msgs.readerHintFailure,
    hintSelectionFailure: msgs.readerHintSelectionFailure
  };
}

export interface ReaderEnvironmentHandlers {
  onMessagesUpdate(messages: ReaderSessionMessages): void;
  onFragmentConfigUpdate(config: FragmentClipperOptions): void;
}

export interface ReaderEnvironmentState {
  controller: PageI18nController | null;
  messages: ReaderSessionMessages;
  fragmentConfig: FragmentClipperOptions;
}

export interface ReaderEnvironmentDependencies {
  doc: Document;
  storage: StorageService;
  optionsRepository: IOptionsRepository;
}

export class ReaderEnvironmentController {
  private controller: PageI18nController | null = null;
  private stopLanguageWatcher: (() => void) | null = null;
  private stopOptionsWatcher: (() => void) | null = null;

  constructor(
    private readonly deps: ReaderEnvironmentDependencies,
    private readonly handlers: ReaderEnvironmentHandlers
  ) {}

  async start(): Promise<ReaderEnvironmentState> {
    this.controller = await ensureContentI18n(this.deps.doc);
    const messages = await this.loadInitialMessages();
    const fragmentConfig = await loadFragmentConfig(this.deps.optionsRepository).catch(
      () => DEFAULT_FRAGMENT_CONFIG
    );

    this.handlers.onMessagesUpdate(messages);
    this.handlers.onFragmentConfigUpdate(fragmentConfig);

    this.registerDynamicMessageWatcher();
    this.registerLanguageWatcher();
    this.registerOptionsWatcher();

    return {
      controller: this.controller,
      messages,
      fragmentConfig
    };
  }

  stop(): void {
    this.stopLanguageWatcher?.();
    this.stopLanguageWatcher = null;
    this.stopOptionsWatcher?.();
    this.stopOptionsWatcher = null;
    this.controller = null;
  }

  private async loadInitialMessages(): Promise<ReaderSessionMessages> {
    try {
      const resource = getContentI18nResource();
      const rawMessages = resource?.messages ?? (await getContentMessages());
      return mapMessagesFromLocale(rawMessages);
    } catch (error) {
      console.warn('[ReaderEnvironment] Failed to load i18n messages, using defaults:', error);
      return DEFAULT_SESSION_MESSAGES;
    }
  }

  private registerDynamicMessageWatcher(): void {
    if (!this.controller) {
      return;
    }
    this.controller.registerDynamic(() => {
      const resource = getContentI18nResource();
      if (!resource) {
        this.handlers.onMessagesUpdate(DEFAULT_SESSION_MESSAGES);
        return;
      }
      this.handlers.onMessagesUpdate(mapMessagesFromLocale(resource.messages));
    });
  }

  private registerLanguageWatcher(): void {
    this.stopLanguageWatcher = this.deps.storage.sync.watchKey<string>('language', () => {
      void (async () => {
        try {
          const resource = getContentI18nResource();
          const updatedMessages = resource?.messages ?? (await getContentMessages());
          this.handlers.onMessagesUpdate(mapMessagesFromLocale(updatedMessages));
        } catch (error) {
          console.warn(
            '[ReaderEnvironment] Failed to refresh messages after language change:',
            error
          );
          this.handlers.onMessagesUpdate(DEFAULT_SESSION_MESSAGES);
        }
      })();
    });
  }

  private registerOptionsWatcher(): void {
    const applyOptions = (): void => {
      void loadFragmentConfig(this.deps.optionsRepository)
        .then((config) => {
          this.handlers.onFragmentConfigUpdate(config);
        })
        .catch(() => {
          this.handlers.onFragmentConfigUpdate(DEFAULT_FRAGMENT_CONFIG);
        });
    };

    this.stopOptionsWatcher = this.deps.optionsRepository.onChange(() => {
      applyOptions();
    });
  }
}
