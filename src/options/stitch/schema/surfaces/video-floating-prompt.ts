import type { ResourceSchema } from '../../types';
import { element } from '../builders/primitives';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const prompt = ctx.appData.surfaces.videoFloatingPrompt;
    const readableLabel = prompt.shortcut ? `${prompt.label} · ${prompt.shortcut}` : prompt.label;

    return {
      id: 'video-floating-prompt',
      kind: 'standalone-page',
      className: 'video-floating-prompt',
      dataset: {
        role: 'video-floating-prompt'
      },
      children: [
        element(
          'button',
          {
            className: 'video-floating-prompt__bubble',
            type: 'button',
            ariaLabel: prompt.label,
            dataset: {
              role: 'video-floating-prompt-bubble',
              ignoreClick: 'false'
            },
            onClick: { id: 'video-floating-prompt:primary' }
          },
          [
            element('span', {
              className: 'video-floating-prompt__icon',
              dataset: { role: 'video-floating-prompt-icon' }
            }),
            element('span', {
              className: 'video-floating-prompt__hint',
              text: readableLabel,
              dataset: {
                role: 'video-floating-prompt-hint',
                baseTitle: prompt.label
              }
            })
          ]
        ),
        element('button', {
          className: 'video-floating-prompt__close',
          type: 'button',
          text: '×',
          ariaLabel: prompt.dismissLabel,
          onClick: { id: 'video-floating-prompt:dismiss' }
        })
      ]
    };
  }
};

export default schema;
