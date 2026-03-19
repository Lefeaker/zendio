import type { StorageAreaService } from '../../platform/interfaces/storage';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import type { IVideoRepository } from '../../shared/repositories/IVideoRepository';
import type { VideoSessionViewFactory } from './application/videoSessionView';

export interface VideoSessionDependencies {
  viewFactory: VideoSessionViewFactory;
  optionsRepository: IOptionsRepository;
  videoRepository: IVideoRepository;
  storage: {
    local: StorageAreaService;
    sync: StorageAreaService;
  };
}
