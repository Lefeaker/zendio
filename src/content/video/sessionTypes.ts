import type { StorageAreaService } from '../../platform/interfaces/storage';
import type { IOptionsRepository } from '../../shared/repositories/IOptionsRepository';
import type { IVideoRepository } from '../../shared/repositories/IVideoRepository';
import type { UsageEventName, UsageEventParamMap } from '../../shared/types/analytics';
import type { VideoSessionViewFactory } from './application/videoSessionView';
import type { SupportProgressReporter } from '../runtime/supportProgress';

export type VideoSessionAddCaptureOptions = {
  comment?: string;
  captureScreenshot?: boolean;
  pauseVideo?: boolean;
  beginEditing?: boolean;
  resumePlayback?: boolean;
  collapseAfterCapture?: boolean;
};

export interface VideoSessionDependencies {
  viewFactory: VideoSessionViewFactory;
  optionsRepository: IOptionsRepository;
  videoRepository: IVideoRepository;
  optionsPageUrl?: string;
  storage: {
    local: StorageAreaService;
    sync: StorageAreaService;
  };
  showSupportProgress?: SupportProgressReporter;
  trackUsageEvent?: <EventName extends UsageEventName>(
    event: EventName,
    params?: UsageEventParamMap[EventName]
  ) => Promise<void>;
}
