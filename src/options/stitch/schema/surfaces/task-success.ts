import type { NodeSchema, ResourceSchema, SupportChannel } from '../../types';
import { actionRow, surfaceBody, surfaceStage, surfaceWindow } from '../builders/surfaces';
import { div, element, strong } from '../builders/primitives';
import { classNames } from '../builders/classNames';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const surface = ctx.appData.surfaces.taskSuccess;
    const supportLinks = ctx.appData.resources.support.channels;

    return {
      id: 'task-success',
      kind: 'modal',
      title: 'Task Success',
      description: '任务完成后的成功提示层。',
      surfacePlacement: 'floating-bottom-right',
      surfaceSkin: 'task-success',
      children: [
        div('resource-modal-stack', [
          surfaceStage([
            surfaceWindow('task-success-window', [
              div('surface-window-header task-success-header', [
                div(classNames.surface.headingCopy, [
                  strong('支持 All in Ob', classNames.surface.windowTitle)
                ]),
                div('task-status-copy', [
                  element('span', { className: 'task-header-status', text: surface.statusMessage }),
                  surface.statusDetail
                    ? element('span', {
                        className: 'task-status-detail',
                        text: surface.statusDetail
                      })
                    : null
                ])
              ]),
              surfaceBody('task-success-body', [
                supportStrip(supportLinks),
                div('task-feedback-card', [
                  div('task-feedback-row', [
                    actionRow([
                      { id: 'task-success:like', label: surface.likeLabel, variant: 'primary' },
                      { id: 'task-success:dislike', label: surface.dislikeLabel, variant: 'ghost' }
                    ]),
                    element('span', {
                      className: 'task-feedback-dismiss',
                      text: surface.dismissLabel
                    })
                  ])
                ])
              ])
            ])
          ])
        ])
      ]
    };
  }
};

function supportStrip(items: SupportChannel[]): NodeSchema {
  return div(
    'task-support-strip',
    items.map((item) =>
      element(
        'a',
        {
          className: 'task-support-link',
          ...(item.href ? { href: item.href } : {}),
          target: '_blank',
          rel: 'noopener noreferrer'
        },
        [
          element('img', {
            className: 'task-support-logo',
            src: item.icon ?? '',
            alt: `${item.title} logo`
          }),
          div('task-support-copy', [
            strong(item.title),
            item.subtitle ? element('span', { text: item.subtitle }) : null
          ])
        ]
      )
    )
  );
}

export default schema;
