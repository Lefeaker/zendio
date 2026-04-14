import type { MessagingService } from '../../platform/interfaces/messaging';
import type { RuntimeService } from '../../platform/interfaces/runtime';
import type { StorageService } from '../../platform/interfaces/storage';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import type { ExtractorRegistryApi } from '../extractors/registry';
import type { ClipPromptGateway } from '../clipper/application/clipPromptGateway';
import type {
  ReaderSessionAdapter,
  VideoSessionAdapter
} from '../clipper/services/selectionController';

interface SupportPromptLike {
  show(options?: unknown): Promise<void> | void;
}

interface LazyRuntimeDependencies {
  document: Document;
  optionsRepository: IOptionsRepository;
  storage: StorageService;
  messaging: Pick<MessagingService, 'send'>;
  runtime: RuntimeService;
}

export function createLazySupportPrompt(document: Document): SupportPromptLike {
  let promptPromise: Promise<SupportPromptLike> | null = null;

  const loadPrompt = async (): Promise<SupportPromptLike> => {
    if (!promptPromise) {
      promptPromise = import('../ui/supportPrompt').then(({ SupportPrompt }) => {
        return new SupportPrompt(document);
      });
    }
    return promptPromise;
  };

  return {
    async show(options?: unknown): Promise<void> {
      const prompt = await loadPrompt();
      await prompt.show(options as never);
    }
  };
}

export function createLazyReaderSessionFactory(
  dependencies: LazyRuntimeDependencies & {
    promptGateway: ClipPromptGateway;
  }
): (doc: Document, url: string) => ReaderSessionAdapter {
  let readerModulePromise: Promise<typeof import('../reader/readerLazyRuntime')> | null = null;

  const loadModule = async () => {
    if (!readerModulePromise) {
      readerModulePromise = import('../reader/readerLazyRuntime');
    }
    return readerModulePromise;
  };

  return (doc: Document, url: string): ReaderSessionAdapter => {
    let adapterPromise: Promise<ReaderSessionAdapter> | null = null;

    const getAdapter = async (): Promise<ReaderSessionAdapter> => {
      if (!adapterPromise) {
        adapterPromise = loadModule().then(({ createReaderSessionAdapter }) =>
          createReaderSessionAdapter(doc, url, {
            optionsRepository: dependencies.optionsRepository,
            storage: dependencies.storage,
            messaging: dependencies.messaging as MessagingService,
            promptGateway: dependencies.promptGateway
          })
        );
      }
      return adapterPromise;
    };

    return {
      async start(initialHighlight) {
        const adapter = await getAdapter();
        await adapter.start(initialHighlight);
      },
      ingestExternalHighlight(range, selectedHtml, selectedText, comment) {
        void getAdapter().then((adapter) => {
          adapter.ingestExternalHighlight(range, selectedHtml, selectedText, comment);
        });
      }
    };
  };
}

export function createLazyVideoSessionFactory(
  dependencies: LazyRuntimeDependencies
): (doc: Document) => VideoSessionAdapter {
  let videoModulePromise: Promise<typeof import('../video/videoLazyRuntime')> | null = null;

  const loadModule = async () => {
    if (!videoModulePromise) {
      videoModulePromise = import('../video/videoLazyRuntime');
    }
    return videoModulePromise;
  };

  return (doc: Document): VideoSessionAdapter => {
    let adapterPromise: Promise<VideoSessionAdapter> | null = null;

    const getAdapter = async (): Promise<VideoSessionAdapter> => {
      if (!adapterPromise) {
        adapterPromise = loadModule().then(({ createVideoSessionAdapter }) =>
          createVideoSessionAdapter(doc, {
            optionsRepository: dependencies.optionsRepository,
            storage: dependencies.storage
          })
        );
      }
      return adapterPromise;
    };

    return {
      async start() {
        const adapter = await getAdapter();
        await adapter.start();
      },
      ingestTextCapture(selectedHtml, selectedText, comment, selectionRange) {
        void getAdapter().then((adapter) => {
          adapter.ingestTextCapture(selectedHtml, selectedText, comment, selectionRange);
        });
      }
    };
  };
}

export async function initializeVideoPromptOnDemand(
  dependencies: Pick<LazyRuntimeDependencies, 'optionsRepository' | 'storage' | 'runtime'>,
  href: string
): Promise<void> {
  const { initializeVideoPromptRuntime } = await import('../video/videoLazyRuntime');
  await initializeVideoPromptRuntime(
    {
      optionsRepository: dependencies.optionsRepository,
      storage: dependencies.storage,
      runtime: dependencies.runtime
    },
    href
  );
}

export function createLazyExtractorRegistry(
  optionsRepository: IOptionsRepository
): ExtractorRegistryApi {
  let registryPromise: Promise<ExtractorRegistryApi> | null = null;

  const loadRegistry = async (): Promise<ExtractorRegistryApi> => {
    if (!registryPromise) {
      registryPromise = import('../extractors/registry').then(
        ({ createDefaultExtractorRegistry }) =>
          createDefaultExtractorRegistry({ optionsRepository })
      );
    }
    return registryPromise;
  };

  return {
    register(source) {
      void loadRegistry().then((registry) => registry.register(source));
    },
    extract(context) {
      return loadRegistry().then((registry) => registry.extract(context));
    },
    list() {
      return loadRegistry().then((registry) => registry.list());
    }
  };
}
