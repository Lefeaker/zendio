import type { VideoSessionMessages } from './sessionMessages';
import { BaseHintManager } from '../shared/hints/baseHintManager';

export type VideoHintState = 'ready' | 'noVideo' | 'noCaptures' | 'saving' | 'exporting' | 'failure';

export interface VideoHintContext {
  videoAvailable: boolean;
  hasCaptures: boolean;
}

export class VideoHintManager extends BaseHintManager<VideoHintState, VideoHintContext> {
  constructor(private readonly getMessages: () => VideoSessionMessages) {
    super('noVideo');
  }

  protected resolveState(state: VideoHintState, context: VideoHintContext): VideoHintState {
    if (state === 'saving' || state === 'exporting' || state === 'failure') {
      return state;
    }

    if (!context.videoAvailable) {
      return 'noVideo';
    }

    if (!context.hasCaptures) {
      return 'noCaptures';
    }

    if (state === 'noCaptures' && context.hasCaptures) {
      return 'ready';
    }

    return state;
  }

  protected getHint(state: VideoHintState): string {
    const messages = this.getMessages();
    switch (state) {
      case 'ready':
        return messages.hintReady;
      case 'noVideo':
        return messages.hintNoVideo;
      case 'noCaptures':
        return messages.hintNoCaptures;
      case 'saving':
        return messages.hintSaving;
      case 'exporting':
        return messages.hintExporting;
      case 'failure':
        return messages.hintFailure;
      default:
        return messages.hintReady;
    }
  }
}
