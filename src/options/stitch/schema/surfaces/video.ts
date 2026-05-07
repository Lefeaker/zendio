import type { ResourceSchema } from '../../types';
import {
  sessionHeader,
  sessionFooterBar,
  sessionItemList,
  sessionPanelShell,
  surfaceBody,
  videoAddCaptureItem,
  videoCaptureItem
} from '../builders/surfaces';
import { div } from '../builders/primitives';
import { classNames } from '../builders/classNames';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const surface = ctx.appData.surfaces.video;

    return {
      id: 'video',
      kind: 'modal',
      title: 'Video Mode',
      description: '视频记录面板，围绕时间点、字幕片段和批注建立视频笔记。',
      surfacePlacement: 'floating-bottom-right',
      surfaceSkin: 'session',
      children: [
        div('resource-modal-stack', [
          sessionPanelShell('video-surface-window', [
            sessionHeader(surface.labels, '▶'),
            surfaceBody(classNames.session.bodyVideo, [
              sessionItemList([
                ...surface.captures.map((capture) => videoCaptureItem(capture, surface.labels)),
                videoAddCaptureItem(surface.labels.addLabel, surface.labels.emptyCapturePlaceholder)
              ])
            ]),
            sessionFooterBar(surface.counter, surface.actions, null, surface.destination)
          ])
        ])
      ]
    };
  }
};

export default schema;
