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
import { RUNTIME_SURFACE_FALLBACK_MESSAGES } from '@i18n/catalog/runtimeSurfaceFallbackMessages';

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
          RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeSurfaceSaveToLabel
        ) ?? RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeSurfaceSaveToLabel,
      configureVaultLabel:
        t?.(
          'schemaRuntimeSurfaceConfigureVaultLabel',
          RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeSurfaceConfigureVaultLabel
        ) ?? RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeSurfaceConfigureVaultLabel
    };
    const panelAriaLabels = {
      resizeHeight:
        t?.(
          'schemaRuntimeSurfaceResizePanelHeightAriaLabel',
          RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeSurfaceResizePanelHeightAriaLabel
        ) ?? RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeSurfaceResizePanelHeightAriaLabel,
      resizePanel:
        t?.(
          'schemaRuntimeSurfaceResizePanelAriaLabel',
          RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeSurfaceResizePanelAriaLabel
        ) ?? RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeSurfaceResizePanelAriaLabel
    };

    return {
      id: 'reader',
      kind: 'modal',
      title:
        t?.(
          'schemaRuntimeReaderTitle',
          RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeReaderTitle
        ) ?? RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeReaderTitle,
      description:
        t?.(
          'schemaRuntimeReaderDescription',
          RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeReaderDescription
        ) ?? RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeReaderDescription,
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
                  RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeSurfaceCollapsePanelAriaLabel
                ) ?? RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeSurfaceCollapsePanelAriaLabel
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
