import type { MessagingService } from '../../platform/interfaces/messaging';
import type { RuntimeService } from '../../platform/interfaces/runtime';
import type { StorageService } from '../../platform/interfaces/storage';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import type {
  LocalVaultPermissionPromptMessage,
  LocalVaultPermissionPromptResponse
} from '../../shared/types';
import type { ExtractorRegistryApi } from '../extractors/registry';
import type { ClipPromptGateway } from '../clipper/application/clipPromptGateway';
import type { ReaderSessionAdapter } from '../clipper/services/selectionController';
import type { VideoSessionAdapter } from '../video/application/videoSessionPort';
import type { SupportProgressReporter } from './supportProgress';
import type {
  ReaderSessionDraftEnvelope,
  SessionDraftStoragePolicy,
  VideoSessionDraftEnvelope
} from '@shared/sessionDrafts';
import type { SessionDraftLeaseOwnerRegistry } from '../sessionDrafts/sessionDraftLeaseOwnerRegistry';
interface SupportPromptLike {
  show(options?: unknown): Promise<void> | void;
}
interface LocalVaultPermissionPromptLike {
  request(message: LocalVaultPermissionPromptMessage): Promise<LocalVaultPermissionPromptResponse>;
}

interface LazyRuntimeDependencies {
  document: Document;
  optionsRepository: IOptionsRepository;
  storage: StorageService;
  messaging: Pick<MessagingService, 'send'>;
  runtime: RuntimeService;
  sessionDraftStoragePolicy?: SessionDraftStoragePolicy;
  sessionDraftLeaseOwners?: SessionDraftLeaseOwnerRegistry;
  showSupportProgress?: SupportProgressReporter;
}

type VideoPromptOnDemandDependencies = Pick<
  LazyRuntimeDependencies,
  | 'optionsRepository'
  | 'storage'
  | 'runtime'
  | 'sessionDraftStoragePolicy'
  | 'sessionDraftLeaseOwners'
  | 'showSupportProgress'
> &
  Partial<Pick<LazyRuntimeDependencies, 'messaging'>>;

type VideoPromptRuntimeModule = typeof import('../video/videoLazyRuntime');
type LoadVideoPromptRuntime = () => Promise<
  Pick<VideoPromptRuntimeModule, 'initializeVideoPromptRuntime'>
>;
type LocalVaultPermissionPromptModule = typeof import('./localVaultPermissionPrompt');
type LoadLocalVaultPermissionPrompt = () => Promise<
  Pick<LocalVaultPermissionPromptModule, 'createLocalVaultPermissionPrompt'>
>;

const VIDEO_PROMPT_HOST_PATTERNS = [
  /(^|\.)youtube\.com$/i,
  /^youtu\.be$/i,
  /(^|\.)bilibili\.com$/i
] as const;

export function isVideoPromptCandidateUrl(href: string): boolean {
  try {
    const url = new URL(href);
    if (!VIDEO_PROMPT_HOST_PATTERNS.some((pattern) => pattern.test(url.hostname))) {
      return false;
    }
    if (url.hostname === 'youtu.be') {
      return url.pathname.length > 1;
    }
    if (/(^|\.)youtube\.com$/i.test(url.hostname)) {
      return url.pathname === '/watch' || url.pathname.startsWith('/shorts/');
    }
    if (/(^|\.)bilibili\.com$/i.test(url.hostname)) {
      return url.pathname.startsWith('/video/') || url.pathname.startsWith('/bangumi/play/');
    }
    return false;
  } catch {
    return false;
  }
}

export function createVideoPromptOnDemandInitializer(loadRuntime: LoadVideoPromptRuntime) {
  return async (dependencies: VideoPromptOnDemandDependencies, href: string): Promise<void> => {
    if (!isVideoPromptCandidateUrl(href)) {
      return;
    }
    const { initializeVideoPromptRuntime } = await loadRuntime();
    await initializeVideoPromptRuntime(dependencies, href);
  };
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

export function createLazyLocalVaultPermissionPrompt(
  dependencies: Pick<LazyRuntimeDependencies, 'document' | 'runtime'> & { window: Window },
  loadPrompt: LoadLocalVaultPermissionPrompt = () => import('./localVaultPermissionPrompt')
): LocalVaultPermissionPromptLike {
  let promptPromise: Promise<LocalVaultPermissionPromptLike> | null = null;

  return {
    request(
      message: LocalVaultPermissionPromptMessage
    ): Promise<LocalVaultPermissionPromptResponse> {
      promptPromise ??= loadPrompt().then(({ createLocalVaultPermissionPrompt }) =>
        createLocalVaultPermissionPrompt(dependencies)
      );
      return promptPromise.then((prompt) => prompt.request(message));
    }
  };
}

function createAbortAwareAdapterLoader<Adapter>(
  startSignal: AbortSignal | undefined,
  loadAdapter: () => Promise<Adapter>
): () => Promise<Adapter> {
  let adapterPromise: Promise<Adapter> | null = null;
  return async () => {
    if (startSignal?.aborted) throw new Error('SESSION_DRAFT_AUTO_RESTORE_ABORTED');
    adapterPromise ??= loadAdapter();
    const adapter = await adapterPromise;
    if (startSignal?.aborted) throw new Error('SESSION_DRAFT_AUTO_RESTORE_ABORTED');
    return adapter;
  };
}

export function createLazyReaderSessionFactory(
  dependencies: LazyRuntimeDependencies & {
    promptGateway: ClipPromptGateway;
  }
): (
  doc: Document,
  url: string,
  initialClaimedDraft?: ReaderSessionDraftEnvelope,
  startSignal?: AbortSignal,
  onStartCommitted?: () => void
) => ReaderSessionAdapter {
  let readerModulePromise: Promise<typeof import('../reader/readerLazyRuntime')> | null = null;

  return (
    doc: Document,
    url: string,
    initialClaimedDraft?: ReaderSessionDraftEnvelope,
    startSignal?: AbortSignal,
    onStartCommitted?: () => void
  ): ReaderSessionAdapter => {
    const getAdapter = createAbortAwareAdapterLoader(startSignal, () => {
      readerModulePromise ??= import('../reader/readerLazyRuntime');
      return readerModulePromise.then(({ createReaderSessionAdapter }) =>
        createReaderSessionAdapter(doc, url, dependencies, initialClaimedDraft, onStartCommitted)
      );
    });

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
): (
  doc: Document,
  initialClaimedDraft?: VideoSessionDraftEnvelope,
  startSignal?: AbortSignal,
  onStartCommitted?: () => void
) => VideoSessionAdapter {
  let videoModulePromise: Promise<typeof import('../video/videoLazyRuntime')> | null = null;

  return (
    doc: Document,
    initialClaimedDraft?: VideoSessionDraftEnvelope,
    startSignal?: AbortSignal,
    onStartCommitted?: () => void
  ): VideoSessionAdapter => {
    const getAdapter = createAbortAwareAdapterLoader(startSignal, () => {
      videoModulePromise ??= import('../video/videoLazyRuntime');
      return videoModulePromise.then(({ createVideoSessionAdapter }) =>
        createVideoSessionAdapter(doc, dependencies, initialClaimedDraft, onStartCommitted)
      );
    });

    return {
      async start(options) {
        const adapter = await getAdapter();
        await adapter.start(options);
      },
      ingestTextCapture(selectedHtml, selectedText, comment, selectionRange) {
        void getAdapter().then((adapter) => {
          adapter.ingestTextCapture(selectedHtml, selectedText, comment, selectionRange);
        });
      }
    };
  };
}

export const initializeVideoPromptOnDemand = createVideoPromptOnDemandInitializer(
  () => import('../video/videoLazyRuntime')
);

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
