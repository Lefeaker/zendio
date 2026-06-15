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
import { DEFAULT_PRODUCTION_ENGLISH_MESSAGES } from '../i18n';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const surface = ctx.appData.surfaces.clipper;
    const t = ctx.t;
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
      title: t?.('schemaRuntimeClipperTitle', 'Clipper Dialog') ?? 'Clipper Dialog',
      description:
        t?.(
          'schemaRuntimeClipperDescription',
          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeClipperDescription
        ) ?? DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaRuntimeClipperDescription,
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
