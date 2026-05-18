import {
  BaseVideoPlatform,
  type VideoPlatformAdapter,
  type VideoPlatformContext
} from './baseVideoPlatform';
import { BilibiliVideoPlatform } from './bilibiliPlatform';
import { YoutubeVideoPlatform } from './youtubePlatform';
import type { VideoPlatform } from '../utils';

export {
  type PlatformSelectionInput,
  type PlatformSelectionResult,
  type TimestampBuildContext
} from './baseVideoPlatform';
export type { VideoPlatformAdapter, VideoPlatformContext } from './baseVideoPlatform';

export function createVideoPlatformAdapter(
  platform: VideoPlatform,
  context: VideoPlatformContext
): VideoPlatformAdapter {
  switch (platform) {
    case 'bilibili':
      return new BilibiliVideoPlatform(context);
    case 'youtube':
      return new YoutubeVideoPlatform(context);
    default:
      return new BaseVideoPlatform(platform, context);
  }
}
