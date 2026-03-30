import type { StorageService } from '../../platform/interfaces/storage';
import type { RuntimeService } from '../../platform/interfaces/runtime';
import type { IVideoRepository } from '../../shared/repositories/IVideoRepository';
import { resolveRepository } from '../../shared/di/serviceRegistry';
import { DI_TOKENS } from '../../shared/di/tokens';

export interface VideoPromptSessionLike {
  start(): Promise<void>;
}

export interface VideoPromptDependencies {
  storage: StorageService;
  runtime: RuntimeService;
  videoRepo: IVideoRepository;
  createVideoSession: (doc: Document) => VideoPromptSessionLike;
}

export interface VideoPromptPlatformDependencies {
  storage: StorageService;
  runtime: RuntimeService;
  videoRepo?: IVideoRepository;
  createVideoSession: (doc: Document) => VideoPromptSessionLike;
}

export function createVideoPromptDependencies(
  platform: VideoPromptPlatformDependencies
): VideoPromptDependencies {
  return {
    storage: platform.storage,
    runtime: platform.runtime,
    videoRepo:
      platform.videoRepo ?? resolveRepository<IVideoRepository>(DI_TOKENS.IVideoRepository),
    createVideoSession: platform.createVideoSession
  };
}
