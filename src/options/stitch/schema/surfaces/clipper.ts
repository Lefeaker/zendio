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

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const surface = ctx.appData.surfaces.clipper;

    return {
      id: 'clipper',
      kind: 'modal',
      title: 'Clipper Dialog',
      description: '用户在网页上选中文本后首先看到的剪藏浮窗。',
      surfacePlacement: 'dialog',
      surfaceSkin: 'clipper',
      children: [
        div('resource-modal-stack', [
          surfaceStage([
            clipperShell([
              clipperHeader(surface.labels.title, null, surface.iconUrl),
              surfaceBody(classNames.clipper.body, [
                selectionPreviewBox(surface.labels.selectionPreview, surface.selectedText),
                commentEditorBlock(surface.labels.commentLabel, surface.commentPlaceholder),
                exportDestinationRow(surface.destination) ?? sourceMetaRow(surface.source),
                clipperActionBar(surface.actions)
              ])
            ])
          ])
        ])
      ]
    };
  }
};

export default schema;
