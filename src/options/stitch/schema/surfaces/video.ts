import type { ResourceSchema } from '../../types';
import {
  sessionHeader,
  videoFooterBar,
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
    const t = ctx.t;
    const notePlaceholder =
      t?.('videoCaptureEditPlaceholder', surface.labels.notePlaceholder) ??
      surface.labels.notePlaceholder;
    const labels = {
      ...surface.labels,
      title: t?.('videoPanelTitle', surface.labels.title) ?? surface.labels.title,
      subtitle: t?.('videoPanelStatus', surface.labels.subtitle) ?? surface.labels.subtitle,
      notePlaceholder,
      fragmentNotePlaceholder:
        t?.(
          'videoCaptureEditPlaceholder',
          surface.labels.fragmentNotePlaceholder ?? surface.labels.notePlaceholder
        ) ??
        surface.labels.fragmentNotePlaceholder ??
        surface.labels.notePlaceholder,
      deleteLabel:
        t?.('videoCaptureDeleteLabel', surface.labels.deleteLabel) ?? surface.labels.deleteLabel,
      addLabel: t?.('videoPanelAdd', surface.labels.addLabel) ?? surface.labels.addLabel,
      emptyCapturePlaceholder:
        t?.('videoCaptureEditPlaceholder', surface.labels.emptyCapturePlaceholder) ??
        surface.labels.emptyCapturePlaceholder
    };
    const actions = surface.actions.map((action) => ({
      ...action,
      label:
        action.id === 'video:finish'
          ? (t?.('videoPanelFinish', action.label) ?? action.label)
          : action.id === 'video:cancel'
            ? (t?.('videoPanelCancel', action.label) ?? action.label)
            : action.label
    }));
    const counter =
      surface.counter === '0'
        ? (t?.('videoPanelCounterZero', surface.counter) ?? surface.counter)
        : (t?.('videoPanelCounter', surface.counter, { count: surface.counter }) ??
          surface.counter);
    const destinationLabels = {
      saveToLabel: t?.('schemaRuntimeSurfaceSaveToLabel', '保存到') ?? '保存到',
      configureVaultLabel: t?.('schemaRuntimeSurfaceConfigureVaultLabel', '配置仓库') ?? '配置仓库'
    };
    const screenshotLabels = {
      capture:
        t?.('schemaRuntimeVideoCaptureScreenshotLabel', 'Capture screenshot') ??
        'Capture screenshot',
      remove:
        t?.('schemaRuntimeVideoRemoveScreenshotLabel', 'Remove screenshot') ?? 'Remove screenshot'
    };

    return {
      id: 'video',
      kind: 'modal',
      title: t?.('schemaRuntimeVideoTitle', 'Video Mode') ?? 'Video Mode',
      description:
        t?.(
          'schemaRuntimeVideoDescription',
          '视频记录面板，围绕时间点、字幕片段和批注建立视频笔记。'
        ) ?? '视频记录面板，围绕时间点、字幕片段和批注建立视频笔记。',
      surfacePlacement: 'floating-bottom-right',
      surfaceSkin: 'session',
      children: [
        div('resource-modal-stack', [
          sessionPanelShell('video-surface-window', [
            sessionHeader(labels, '▶'),
            surfaceBody(classNames.session.bodyVideo, [
              sessionItemList([
                ...surface.captures.map((capture) =>
                  videoCaptureItem(capture, labels, screenshotLabels)
                ),
                videoAddCaptureItem(labels.addLabel, labels.emptyCapturePlaceholder)
              ])
            ]),
            videoFooterBar(counter, actions, null, surface.destination, destinationLabels)
          ])
        ])
      ]
    };
  }
};

export default schema;
