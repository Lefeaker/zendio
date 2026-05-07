import type { StorageService } from '../../platform/interfaces/storage';
import type { RuntimeService } from '../../platform/interfaces/runtime';
import type { IVideoRepository } from '../../shared/repositories/IVideoRepository';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import { resolveRepository } from '../../shared/di/serviceRegistry';
import { DI_TOKENS } from '../../shared/di/tokens';
import { getControlledRuntimeTheme, resolveRuntimeThemeFromOptions } from '../stitch/runtimeTheme';

export type VideoPromptRuntimeTheme = 'dark' | 'light';

export interface VideoPromptSessionLike {
  start(): Promise<void>;
  addCurrentTimestamp?(
    source?: 'button' | 'note-input',
    options?: {
      comment?: string;
      captureScreenshot?: boolean;
      pauseVideo?: boolean;
      beginEditing?: boolean;
      resumePlayback?: boolean;
      collapseAfterCapture?: boolean;
    }
  ): Promise<void>;
}

export interface VideoPromptDependencies {
  storage: StorageService;
  runtime: RuntimeService;
  videoRepo: IVideoRepository;
  createVideoSession: (doc: Document) => VideoPromptSessionLike;
  getRuntimeTheme: () => VideoPromptRuntimeTheme | null | Promise<VideoPromptRuntimeTheme | null>;
}

export interface VideoPromptPlatformDependencies {
  storage: StorageService;
  runtime: RuntimeService;
  optionsRepository?: IOptionsRepository;
  videoRepo?: IVideoRepository;
  createVideoSession: (doc: Document) => VideoPromptSessionLike;
  getRuntimeTheme?: () => VideoPromptRuntimeTheme | null | Promise<VideoPromptRuntimeTheme | null>;
}

export function createVideoPromptDependencies(
  platform: VideoPromptPlatformDependencies
): VideoPromptDependencies {
  return {
    storage: platform.storage,
    runtime: platform.runtime,
    videoRepo:
      platform.videoRepo ?? resolveRepository<IVideoRepository>(DI_TOKENS.IVideoRepository),
    createVideoSession: platform.createVideoSession,
    getRuntimeTheme:
      platform.getRuntimeTheme ??
      (platform.optionsRepository
        ? async () => {
            const options = await platform.optionsRepository?.get();
            return resolveRuntimeThemeFromOptions(options) ?? getControlledRuntimeTheme();
          }
        : () => getControlledRuntimeTheme())
  };
}
