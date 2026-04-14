import type { RuntimeService } from '../../platform/interfaces/runtime';
import type { StorageService } from '../../platform/interfaces/storage';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import type { VideoSessionAdapter } from '../clipper/services/selectionController';
import { initVideoPrompt } from './prompt';
import { createVideoPromptDependencies } from './videoPromptDependencies';
import { matchesSupportedVideoHost } from './videoPromptObserver';
import { VideoSession } from './videoSessionRuntime';
import { createVideoSessionDependencies } from './sessionDependencies';

export interface VideoLazyRuntimeDependencies {
  optionsRepository: IOptionsRepository;
  storage: StorageService;
}

export interface VideoPromptRuntimeDependencies extends VideoLazyRuntimeDependencies {
  runtime: RuntimeService;
}

export function createVideoSessionAdapter(
  doc: Document,
  dependencies: VideoLazyRuntimeDependencies
): VideoSessionAdapter {
  let sessionPromise: Promise<VideoSessionAdapter> | null = null;

  const getSession = async (): Promise<VideoSessionAdapter> => {
    if (!sessionPromise) {
      sessionPromise = Promise.resolve().then(() => {
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
}

export async function initializeVideoPromptRuntime(
  dependencies: VideoPromptRuntimeDependencies,
  href: string
): Promise<void> {
  if (!matchesSupportedVideoHost(href)) {
    return;
  }

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
