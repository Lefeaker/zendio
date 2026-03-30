import { ClipperDialog } from '../content/clipper/components/dialog';
import { ReaderSession } from '../content/reader/session';
import type { ReaderSessionDependencies } from '../content/reader/session';
import { createReaderPanelViewFactory } from '../content/reader/presentation/readerPanelView';
import { ReaderHighlightManager } from '../content/reader/services/highlightManager';
import { ReaderSelectionController } from '../content/reader/services/selectionController';
import { ReaderPanelCoordinator } from '../content/reader/panelCoordinator';
import { ReaderEnvironmentController } from '../content/reader/environmentController';
import { ReaderSessionLifecycle } from '../content/reader/sessionLifecycle';
import { ReaderSessionExporter } from '../content/reader/services/exporter';
import {
  buildReaderFullMarkdown,
  buildReaderHighlightsMarkdown
} from '../content/reader/utils/markdownBuilder';
import { VideoSession } from '../content/video/session';
import type {
  StorageAreaChangeCallback,
  StorageAreaService,
  StorageChangeCallback,
  StorageService
} from '../platform/interfaces/storage';
import { registerService, TOKENS } from '../shared/di';
import { registerFallbackRepositories } from '../shared/di/serviceRegistry';
import { createPreviewPlatformServices } from '../platform/preview/services';

const status = document.getElementById('status');

function setStatus(message: string): void {
  if (status) {
    status.textContent = message;
  }
}

function createStorageArea(): StorageAreaService {
  const values = new Map<string, unknown>();
  return {
    async get<T = unknown>(key: string): Promise<T | undefined> {
      return values.get(key) as T | undefined;
    },
    async set<T = unknown>(key: string, value: T): Promise<void> {
      values.set(key, value);
    },
    async getMany<T = unknown>(keys: string[]): Promise<Record<string, T | undefined>> {
      return Object.fromEntries(keys.map((key) => [key, values.get(key) as T | undefined]));
    },
    async setMany<T = unknown>(entries: Record<string, T>): Promise<void> {
      for (const [key, value] of Object.entries(entries)) {
        values.set(key, value);
      }
    },
    async remove(key: string | string[]): Promise<void> {
      for (const currentKey of Array.isArray(key) ? key : [key]) {
        values.delete(currentKey);
      }
    },
    async clear(): Promise<void> {
      values.clear();
    },
    watchKey<T = unknown>(_key: string, _callback: StorageChangeCallback<T>): () => void {
      return () => undefined;
    },
    watchAll(_callback: StorageAreaChangeCallback): () => void {
      return () => undefined;
    }
  };
}

const storage: StorageService = {
  local: createStorageArea(),
  sync: createStorageArea(),
  session: createStorageArea()
};

const optionsRepository = {
  async get() {
    return {
      readingSession: { exportMode: 'highlights', highlightTheme: 'gradient' },
      video: {
        floatingPromptEnabled: true,
        promptButtonLabel: '开启视频笔记',
        promptShortcut: 'Alt+V'
      }
    };
  },
  async set() {},
  onChange() {
    return () => undefined;
  }
};

const clipRepo = {
  async getFragmentConfig() {
    return {
      useFootnoteFormat: true,
      captureContext: false,
      contextLength: 200,
      contextMode: 'chars',
      selectionModifierEnabled: false,
      selectionModifierKeys: [],
      keyboardShortcutsEnabled: true
    };
  },
  onConfigChange() {
    return () => undefined;
  }
};

const previewPlatformServices = createPreviewPlatformServices(storage);
registerService(TOKENS.platformServices, () => previewPlatformServices);
registerFallbackRepositories();

const runtime = previewPlatformServices.runtime;

const errorHandler = {
  async handle(error: unknown) {
    console.warn('[harness:errorHandler]', error);
  }
};

let activeReader: ReaderSession | null = null;
let activeVideo: VideoSession | null = null;

function buildReaderDependencies(): ReaderSessionDependencies {
  return {
    viewFactory: createReaderPanelViewFactory(),
    optionsRepository: optionsRepository as never,
    storage,
    messaging: {
      async send<TResult = unknown>(message: unknown): Promise<TResult> {
        console.info('[harness:reader:send]', message);
        return undefined as TResult;
      }
    },
    readerRepository: {
      async getReadingConfig() {
        return { exportMode: 'highlights', highlightTheme: 'gradient' };
      },
      async sendReadingClip() {
        return { success: true };
      },
      onConfigChange() {
        return () => undefined;
      }
    },
    createHighlightManager: (doc) => new ReaderHighlightManager(doc),
    createSelectionController: (options) => new ReaderSelectionController(options),
    createPanelCoordinator: (options) => new ReaderPanelCoordinator(options),
    createEnvironmentController: (deps, handlers) =>
      new ReaderEnvironmentController(deps, handlers),
    createLifecycle: (deps, handlers) => new ReaderSessionLifecycle(deps, handlers),
    exporter: new ReaderSessionExporter({
      buildHighlightsMarkdown: buildReaderHighlightsMarkdown,
      buildFullMarkdown: buildReaderFullMarkdown
    }),
    async dispatchClipResult(payload: unknown) {
      console.info('[harness:reader:clip]', payload);
      setStatus('ReaderSession exported once');
    }
  };
}

async function openClipperDialog(): Promise<void> {
  const dialog = new ClipperDialog({
    storage,
    errorHandler: errorHandler as never,
    runtime: runtime as never,
    clipRepo: clipRepo as never
  });
  void dialog.show('Harness selection', { initialComment: 'Harness note' });
  setStatus('ClipperDialog opened');
}

async function startReaderSession(): Promise<void> {
  activeReader?.destroy();
  const article = document.getElementById('reader-article');
  const paragraph = article?.querySelector('p');
  if (!paragraph) {
    throw new Error('Reader paragraph missing');
  }
  const range = document.createRange();
  range.selectNodeContents(paragraph);
  activeReader = new ReaderSession(
    document,
    window.location.href,
    {
      async requestSelectionAction() {
        return { action: 'clip', comment: 'Reader harness comment' };
      }
    },
    buildReaderDependencies()
  );
  await activeReader.initialize({
    range,
    selectedHtml: paragraph.innerHTML,
    selectedText: paragraph.textContent ?? '',
    comment: 'Reader harness comment'
  });
  setStatus('ReaderSession mounted');
}

async function startVideoSession(): Promise<void> {
  (activeVideo as unknown as { cleanup?: () => void } | null)?.cleanup?.();
  const video = document.querySelector('video');
  if (!(video instanceof HTMLVideoElement)) {
    throw new Error('Video element missing');
  }
  Object.defineProperty(video, 'currentTime', {
    configurable: true,
    writable: true,
    value: 42
  });
  activeVideo = new VideoSession(document, {
    viewFactory: (
      await import('../content/video/presentation/videoPanelView')
    ).createVideoPanelViewFactory(),
    optionsRepository: optionsRepository as never,
    videoRepository: {
      async getVideoConfig() {
        return {
          floatingPromptEnabled: true,
          promptButtonLabel: '开启视频笔记',
          promptShortcut: 'Alt+V'
        };
      },
      async savePromptPosition() {},
      async getPromptPosition() {
        return null;
      },
      async sendVideoClip() {
        setStatus('VideoSession exported once');
        return { success: true };
      },
      onConfigChange() {
        return () => undefined;
      }
    } as never,
    storage
  } as never);
  await activeVideo.start();
  await (activeVideo as unknown as { handleAddCapture: () => Promise<void> }).handleAddCapture();
  setStatus('VideoSession mounted and one capture added');
}

document.getElementById('open-clipper')?.addEventListener('click', () => {
  void openClipperDialog().catch((error) => {
    console.error('[harness:clipper]', error);
    setStatus(`Clipper failed: ${String(error)}`);
  });
});
document.getElementById('start-reader')?.addEventListener('click', () => {
  void startReaderSession().catch((error) => {
    console.error('[harness:reader]', error);
    setStatus(`Reader failed: ${String(error)}`);
  });
});
document.getElementById('start-video')?.addEventListener('click', () => {
  void startVideoSession().catch((error) => {
    console.error('[harness:video]', error);
    setStatus(`Video failed: ${String(error)}`);
  });
});

(
  window as Window & {
    harness?: {
      openClipperDialog: () => Promise<void>;
      startReaderSession: () => Promise<void>;
      startVideoSession: () => Promise<void>;
    };
  }
).harness = {
  openClipperDialog,
  startReaderSession,
  startVideoSession
};

setStatus('Harness ready');
