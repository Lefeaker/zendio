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
      saveToLabel: t?.('schemaRuntimeSurfaceSaveToLabel', '保存到') ?? '保存到',
      configureVaultLabel: t?.('schemaRuntimeSurfaceConfigureVaultLabel', '配置仓库') ?? '配置仓库'
    };

    return {
      id: 'reader',
      kind: 'modal',
      title: t?.('schemaRuntimeReaderTitle', 'Reader Mode') ?? 'Reader Mode',
      description:
        t?.(
          'schemaRuntimeReaderDescription',
          '阅读模式悬浮面板，保留真实的高亮列表与行内批注编辑节奏。'
        ) ?? '阅读模式悬浮面板，保留真实的高亮列表与行内批注编辑节奏。',
      surfacePlacement: 'floating-bottom-right',
      surfaceSkin: 'session',
      children: [
        div('resource-modal-stack', [
          sessionPanelShell('reader-surface-window', [
            sessionHeader(labels, '✦', surface.iconUrl),
            surfaceBody(classNames.session.bodyReader, [
              sessionItemList(
                surface.highlights.map((highlight) => readerHighlightItem(highlight, labels))
              )
            ]),
            sessionFooterBar(counter, actions, null, surface.destination, destinationLabels)
          ])
        ])
      ]
    };
  }
};

export default schema;
