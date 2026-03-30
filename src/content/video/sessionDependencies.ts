import { resolveRepository } from '../../shared/di/serviceRegistry';
import { DI_TOKENS } from '../../shared/di/tokens';
import type { VideoSessionDependencies } from './sessionTypes';
import { createVideoPanelViewFactory } from './presentation/videoPanelView';
import type { IVideoRepository } from '../../shared/repositories/IVideoRepository';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import type { StorageService } from '../../platform/interfaces/storage';

export interface VideoSessionPlatformDependencies {
  // Content composition root now passes the primary repository contract.
  optionsRepository: IOptionsRepository;
  videoRepository?: IVideoRepository;
  storage: StorageService;
}

export function createVideoSessionDependencies(
  deps: VideoSessionPlatformDependencies
): VideoSessionDependencies {
  return {
    viewFactory: createVideoPanelViewFactory(),
    optionsRepository: deps.optionsRepository,
    videoRepository:
      deps.videoRepository ?? resolveRepository<IVideoRepository>(DI_TOKENS.IVideoRepository),
    storage: deps.storage
  };
}
