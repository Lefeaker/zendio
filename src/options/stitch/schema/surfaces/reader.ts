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

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const surface = ctx.appData.surfaces.reader;

    return {
      id: 'reader',
      kind: 'modal',
      title: 'Reader Mode',
      description: '阅读模式悬浮面板，保留真实的高亮列表与行内批注编辑节奏。',
      surfacePlacement: 'floating-bottom-right',
      surfaceSkin: 'session',
      children: [
        div('resource-modal-stack', [
          sessionPanelShell('reader-surface-window', [
            sessionHeader(surface.labels, '✦', surface.iconUrl),
            surfaceBody(classNames.session.bodyReader, [
              sessionItemList(
                surface.highlights.map((highlight) =>
                  readerHighlightItem(highlight, surface.labels)
                )
              )
            ]),
            sessionFooterBar(surface.counter, surface.actions, null, surface.destination)
          ])
        ])
      ]
    };
  }
};

export default schema;
