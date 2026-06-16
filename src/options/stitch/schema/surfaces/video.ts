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
import { DEFAULT_PRODUCTION_ENGLISH_MESSAGES } from '../i18n';

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
      saveToLabel:
        t?.(
          'schemaRuntimeSurfaceSaveToLabel',
          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeSurfaceSaveToLabel
        ) ?? DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeSurfaceSaveToLabel,
      configureVaultLabel:
        t?.(
          'schemaRuntimeSurfaceConfigureVaultLabel',
          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeSurfaceConfigureVaultLabel
        ) ?? DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeSurfaceConfigureVaultLabel
    };
    const screenshotLabels = {
      capture:
        t?.(
          'schemaRuntimeVideoCaptureScreenshotLabel',
          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeVideoCaptureScreenshotLabel
        ) ?? DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeVideoCaptureScreenshotLabel,
      remove:
        t?.(
          'schemaRuntimeVideoRemoveScreenshotLabel',
          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeVideoRemoveScreenshotLabel
        ) ?? DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeVideoRemoveScreenshotLabel
    };
    const panelAriaLabels = {
      resizeHeight:
        t?.(
          'schemaRuntimeSurfaceResizePanelHeightAriaLabel',
          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeSurfaceResizePanelHeightAriaLabel
        ) ?? DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeSurfaceResizePanelHeightAriaLabel,
      resizePanel:
        t?.(
          'schemaRuntimeSurfaceResizePanelAriaLabel',
          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeSurfaceResizePanelAriaLabel
        ) ?? DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeSurfaceResizePanelAriaLabel
    };

    return {
      id: 'video',
      kind: 'modal',
      title:
        t?.(
          'schemaRuntimeVideoTitle',
          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeVideoTitle
        ) ?? DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeVideoTitle,
      description:
        t?.(
          'schemaRuntimeVideoDescription',
          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeVideoDescription
        ) ?? DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeVideoDescription,
      surfacePlacement: 'floating-bottom-right',
      surfaceSkin: 'session',
      children: [
        div('resource-modal-stack', [
          sessionPanelShell(
            'video-surface-window',
            [
              sessionHeader(
                labels,
                '▶',
                undefined,
                t?.(
                  'schemaRuntimeSurfaceCollapsePanelAriaLabel',
                  DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeSurfaceCollapsePanelAriaLabel
                ) ?? DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeSurfaceCollapsePanelAriaLabel
              ),
              surfaceBody(classNames.session.bodyVideo, [
                sessionItemList([
                  ...surface.captures.map((capture) =>
                    videoCaptureItem(capture, labels, screenshotLabels)
                  ),
                  videoAddCaptureItem(labels.addLabel, labels.emptyCapturePlaceholder)
                ])
              ]),
              videoFooterBar(counter, actions, null, surface.destination, destinationLabels)
            ],
            panelAriaLabels
          )
        ])
      ]
    };
  }
};

export default schema;
