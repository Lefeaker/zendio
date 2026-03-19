import type { StorageService } from '../../platform/interfaces/storage';
import type { RuntimeService } from '../../platform/interfaces/runtime';
import type { IVideoRepository } from '../../shared/repositories/IVideoRepository';
import { resolveRepository } from '../../shared/di/serviceRegistry';
import { DI_TOKENS } from '../../shared/di/tokens';

export interface VideoPromptDependencies {
  storage: StorageService;
  runtime: RuntimeService;
  videoRepo: IVideoRepository;
}

export interface VideoPromptPlatformDependencies {
  storage: StorageService;
  runtime: RuntimeService;
}

export function createVideoPromptDependencies(platform: VideoPromptPlatformDependencies): VideoPromptDependencies {
  return {
    storage: platform.storage,
    runtime: platform.runtime,
    videoRepo: resolveRepository<IVideoRepository>(DI_TOKENS.IVideoRepository)
  };
}
