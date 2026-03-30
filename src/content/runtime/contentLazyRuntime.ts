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
  let readerModulePromise: Promise<typeof import('../reader/session')> | null = null;

  const loadModule = async () => {
    if (!readerModulePromise) {
      readerModulePromise = import('../reader/session');
    }
    return readerModulePromise;
  };

  return (doc: Document, url: string): ReaderSessionAdapter => {
    let sessionPromise: Promise<ReaderSessionAdapter> | null = null;

    const getSession = async (): Promise<ReaderSessionAdapter> => {
      if (!sessionPromise) {
        sessionPromise = loadModule().then(async ({ ReaderSession }) => {
          const { createReaderSessionDependencies } = await import('../reader/sessionDependencies');
          const readerDependencies = createReaderSessionDependencies({
            optionsRepository: dependencies.optionsRepository,
            storage: dependencies.storage,
            messaging: dependencies.messaging as MessagingService
          });
          return new ReaderSession(doc, url, dependencies.promptGateway, readerDependencies);
        });
      }
      return sessionPromise;
    };

    return {
      async start(initialHighlight) {
        const session = await getSession();
        await session.start(initialHighlight);
      },
      ingestExternalHighlight(range, selectedHtml, selectedText, comment) {
        void getSession().then((session) => {
          session.ingestExternalHighlight(range, selectedHtml, selectedText, comment);
        });
      }
    };
  };
}

export function createLazyVideoSessionFactory(
  dependencies: LazyRuntimeDependencies
): (doc: Document) => VideoSessionAdapter {
  let videoModulePromise: Promise<typeof import('../video/session')> | null = null;

  const loadModule = async () => {
    if (!videoModulePromise) {
      videoModulePromise = import('../video/session');
    }
    return videoModulePromise;
  };

  return (doc: Document): VideoSessionAdapter => {
    let sessionPromise: Promise<VideoSessionAdapter> | null = null;

    const getSession = async (): Promise<VideoSessionAdapter> => {
      if (!sessionPromise) {
        sessionPromise = loadModule().then(async ({ VideoSession }) => {
          const { createVideoSessionDependencies } = await import('../video/sessionDependencies');
          const videoDependencies = createVideoSessionDependencies({
            optionsRepository: dependencies.optionsRepository,
            storage: dependencies.storage
          });
          return new VideoSession(doc, videoDependencies);
        });
      }
      return sessionPromise;
    };

    return {
      async start() {
        const session = await getSession();
        await session.start();
      },
      ingestTextCapture(selectedHtml, selectedText, comment, selectionRange) {
        void getSession().then((session) => {
          session.ingestTextCapture(selectedHtml, selectedText, comment, selectionRange);
        });
      }
    };
  };
}

export async function initializeVideoPromptOnDemand(
  dependencies: Pick<LazyRuntimeDependencies, 'optionsRepository' | 'storage' | 'runtime'>,
  href: string
): Promise<void> {
  const { matchesSupportedVideoHost } = await import('../video/videoPromptObserver');
  if (!matchesSupportedVideoHost(href)) {
    return;
  }

  const { initVideoPrompt } = await import('../video/prompt');
  const { createVideoPromptDependencies } = await import('../video/videoPromptDependencies');
  const { VideoSession } = await import('../video/session');
  const { createVideoSessionDependencies } = await import('../video/sessionDependencies');

  await initVideoPrompt(
    createVideoPromptDependencies({
      storage: dependencies.storage,
      runtime: dependencies.runtime,
      createVideoSession: (doc) =>
        new VideoSession(
          doc,
          createVideoSessionDependencies({
            optionsRepository: dependencies.optionsRepository,
            storage: dependencies.storage
          })
        )
    })
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
