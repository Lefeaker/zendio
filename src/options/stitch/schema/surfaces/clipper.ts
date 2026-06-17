import type { ResourceSchema } from '../../types';
import {
  clipperHeader,
  clipperActionBar,
  clipperShell,
  commentEditorBlock,
  exportDestinationRow,
  selectionPreviewBox,
  sourceMetaRow,
  surfaceBody,
  surfaceStage
} from '../builders/surfaces';
import { div } from '../builders/primitives';
import { classNames } from '../builders/classNames';
import { RUNTIME_SURFACE_FALLBACK_MESSAGES } from '@i18n/catalog/runtimeSurfaceFallbackMessages';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const surface = ctx.appData.surfaces.clipper;
    const t = ctx.t;
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
    const actions = surface.actions.map((action) => ({
      ...action,
      label:
        action.id === 'reader'
          ? (t?.('addToReaderButton', action.label) ?? action.label)
          : action.id === 'video'
            ? (t?.('clipSelectionVideo', action.label) ?? action.label)
            : action.id === 'clip'
              ? (t?.('clipSelection', action.label) ?? action.label)
              : action.label
    }));

    return {
      id: 'clipper',
      kind: 'modal',
      title:
        t?.(
          'schemaRuntimeClipperTitle',
          RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeClipperTitle
        ) ?? RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeClipperTitle,
      description:
        t?.(
          'schemaRuntimeClipperDescription',
          RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeClipperDescription
        ) ?? RUNTIME_SURFACE_FALLBACK_MESSAGES.schemaRuntimeClipperDescription,
      surfacePlacement: 'dialog',
      surfaceSkin: 'clipper',
      children: [
        div('resource-modal-stack', [
          surfaceStage([
            clipperShell([
              clipperHeader(
                t?.('clipSelection', surface.labels.title) ?? surface.labels.title,
                null,
                surface.iconUrl
              ),
              surfaceBody(classNames.clipper.body, [
                selectionPreviewBox(surface.labels.selectionPreview, surface.selectedText),
                commentEditorBlock(
                  surface.labels.commentLabel,
                  t?.('commentPlaceholder', surface.commentPlaceholder) ??
                    surface.commentPlaceholder
                ),
                exportDestinationRow(surface.destination, destinationLabels) ??
                  sourceMetaRow(surface.source),
                clipperActionBar(actions)
              ])
            ])
          ])
        ])
      ]
    };
  }
};

export default schema;
