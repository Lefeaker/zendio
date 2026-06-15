import { resolveRepository } from '../../shared/di/serviceRegistry';
import { DI_TOKENS } from '../../shared/di/tokens';
import type { VideoSessionDependencies } from './sessionTypes';
import { createVideoPanelViewFactory } from './presentation/videoPanelView';
import type { IVideoRepository } from '../../shared/repositories/IVideoRepository';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import type { MessagingService } from '../../platform/interfaces/messaging';
import type { StorageService } from '../../platform/interfaces/storage';
import type { SupportProgressReporter } from '../runtime/supportProgress';
import { createVisibleTabVideoFrameScreenshotCapture } from './videoVisibleTabScreenshot';
import { createVideoScreenshotCacheClientRepository } from './videoScreenshotCacheClientRepository';

export interface VideoSessionPlatformDependencies {
  // Content composition root now passes the primary repository contract.
  optionsRepository: IOptionsRepository;
  videoRepository?: IVideoRepository;
  storage: StorageService;
  messaging?: Pick<MessagingService, 'send'>;
  showSupportProgress?: SupportProgressReporter;
}

export function createVideoSessionDependencies(
  deps: VideoSessionPlatformDependencies
): VideoSessionDependencies {
  return {
    viewFactory: createVideoPanelViewFactory(),
    optionsRepository: deps.optionsRepository,
    videoRepository:
      deps.videoRepository ?? resolveRepository<IVideoRepository>(DI_TOKENS.IVideoRepository),
    storage: deps.storage,
    ...(deps.messaging
      ? {
          captureVisibleVideoFrameScreenshot: createVisibleTabVideoFrameScreenshotCapture({
            messaging: deps.messaging
          }),
          screenshotCacheRepository: createVideoScreenshotCacheClientRepository({
            messaging: deps.messaging
          })
        }
      : {}),
    ...(deps.showSupportProgress ? { showSupportProgress: deps.showSupportProgress } : {})
  };
}
