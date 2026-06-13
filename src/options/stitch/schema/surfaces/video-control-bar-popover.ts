import type { ResourceSchema } from '../../types';
import { element } from '../builders/primitives';

function preferenceRow(preference: 'autoPauseEnabled' | 'captureScreenshotEnabled', label: string) {
  return element(
    'label',
    {
      className: 'aiob-video-control-bar-popover__option'
    },
    [
      element('input', {
        type: 'checkbox',
        dataset: {
          preference
        }
      }),
      element('span', {
        text: label
      })
    ]
  );
}

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const surface = ctx.appData.surfaces.videoControlBarPopover ?? {
      texts: {
        notePlaceholder: '',
        noteAriaLabel: '',
        autoPauseLabel: '',
        screenshotLabel: ''
      },
      preferences: {
        autoPauseEnabled: true,
        captureScreenshotEnabled: true
      }
    };

    return {
      id: 'video-control-bar-popover',
      kind: 'standalone-page',
      className: 'video-control-bar-popover-surface',
      children: [
        element('input', {
          type: 'text',
          className: 'aiob-video-control-bar-popover__note-input',
          dataset: {
            aiobVideoControlBarNoteInput: 'true'
          }
        }),
        preferenceRow('autoPauseEnabled', surface.texts.autoPauseLabel),
        preferenceRow('captureScreenshotEnabled', surface.texts.screenshotLabel)
      ]
    };
  }
};

export default schema;
