import type { ResourceSchema } from '../../types';
import {
  readerHighlightItem,
  sessionHeader,
  sessionFooterBar,
  sessionItemList,
  sessionPanelShell,
  surfaceBody
} from '../builders/surfaces';
import { div } from '../builders/primitives';
import { classNames } from '../builders/classNames';
import { DEFAULT_PRODUCTION_ENGLISH_MESSAGES } from '../i18n';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const surface = ctx.appData.surfaces.reader;
    const t = ctx.t;
    const labels = {
      ...surface.labels,
      title: t?.('readerPanelTitle', surface.labels.title) ?? surface.labels.title,
      subtitle: t?.('readerPanelStatus', surface.labels.subtitle) ?? surface.labels.subtitle,
      notePlaceholder:
        t?.('readerHighlightEditPlaceholder', surface.labels.notePlaceholder) ??
        surface.labels.notePlaceholder,
      saveLabel:
        t?.('readerHighlightSaveLabel', surface.labels.saveLabel) ?? surface.labels.saveLabel,
      deleteLabel:
        t?.('readerHighlightDeleteLabel', surface.labels.deleteLabel) ?? surface.labels.deleteLabel
    };
    const counter =
      surface.counter === '0'
        ? (t?.('readerPanelCounterZero', surface.counter) ?? surface.counter)
        : (t?.('readerPanelCounter', surface.counter, { count: surface.counter }) ??
          surface.counter);
    const actions = surface.actions.map((action) => ({
      ...action,
      label:
        action.id === 'reader:finish'
          ? (t?.('readerPanelFinish', action.label) ?? action.label)
          : action.id === 'reader:cancel'
            ? (t?.('readerPanelCancel', action.label) ?? action.label)
            : action.label
    }));
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
      id: 'reader',
      kind: 'modal',
      title:
        t?.(
          'schemaRuntimeReaderTitle',
          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeReaderTitle
        ) ?? DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeReaderTitle,
      description:
        t?.(
          'schemaRuntimeReaderDescription',
          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeReaderDescription
        ) ?? DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeReaderDescription,
      surfacePlacement: 'floating-bottom-right',
      surfaceSkin: 'session',
      children: [
        div('resource-modal-stack', [
          sessionPanelShell(
            'reader-surface-window',
            [
              sessionHeader(
                labels,
                '✦',
                surface.iconUrl,
                t?.(
                  'schemaRuntimeSurfaceCollapsePanelAriaLabel',
                  DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeSurfaceCollapsePanelAriaLabel
                ) ?? DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeSurfaceCollapsePanelAriaLabel
              ),
              surfaceBody(classNames.session.bodyReader, [
                sessionItemList(
                  surface.highlights.map((highlight) => readerHighlightItem(highlight, labels))
                )
              ]),
              sessionFooterBar(counter, actions, null, surface.destination, destinationLabels)
            ],
            panelAriaLabels
          )
        ])
      ]
    };
  }
};

export default schema;
