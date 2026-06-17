import type { GroupNode, SchemaContext } from '../../types';
import {
  getDefaultProductionEnglishMessage,
  type SchemaMessageKey,
  type SchemaMessageValues
} from '../i18n';
import { boundInput, boundSwitch } from '../builders/controls';
import { element, emptyState, grid, stack } from '../builders/primitives';

function translate(
  current: SchemaContext,
  key: SchemaMessageKey,
  values?: SchemaMessageValues
): string {
  const fallback = getDefaultProductionEnglishMessage(key, values);
  return current.t ? current.t(key, fallback, values) : fallback;
}

export function createVideoCaptureSourcesGroup(ctx: SchemaContext): GroupNode {
  return {
    kind: 'group',
    title: translate(ctx, 'schemaCaptureSourcesVideoGroupTitle'),
    children: [
      {
        kind: 'card',
        title: translate(ctx, 'schemaCaptureSourcesVideoPromptEntryTitle'),
        description: translate(ctx, 'schemaCaptureSourcesVideoPromptEntryDescription'),
        body: [
          {
            kind: 'rows',
            items: [
              {
                kind: 'row',
                title: translate(ctx, 'schemaCaptureSourcesVideoEntryBehaviorTitle'),
                description: translate(ctx, 'schemaCaptureSourcesVideoEntryBehaviorDescription'),
                control: grid(
                  2,
                  [
                    element('div', { className: 'video-entry-toggle' }, [
                      element('span', {
                        text: (current) =>
                          translate(current, 'schemaCaptureSourcesVideoNoteButtonLabel')
                      }),
                      boundSwitch({
                        bind: 'videoFloatingPromptEnabled',
                        compact: true,
                        stateText: (current) =>
                          current.state.videoFloatingPromptEnabled
                            ? translate(current, 'schemaCommonEnabledState')
                            : translate(current, 'schemaCommonDisabledState'),
                        onChange: {
                          id: 'options:updateField',
                          args: ['video.floatingPromptEnabled'],
                          valueFrom: 'target.checked'
                        }
                      })
                    ]),
                    element('div', { className: 'video-entry-toggle' }, [
                      element('span', {
                        text: (current) => translate(current, 'schemaCaptureSourcesAutoPauseTitle')
                      }),
                      boundSwitch({
                        bind: 'videoCommentEditorAutoPause',
                        compact: true,
                        stateText: (current) =>
                          current.state.videoCommentEditorAutoPause
                            ? translate(current, 'schemaCommonEnabledState')
                            : translate(current, 'schemaCommonDisabledState'),
                        onChange: {
                          id: 'options:updateField',
                          args: ['video.commentEditorAutoPause'],
                          valueFrom: 'target.checked'
                        }
                      })
                    ])
                  ],
                  'video-entry-toggle-row'
                )
              }
            ]
          },
          emptyState(translate(ctx, 'schemaCaptureSourcesVideoPromptHelper')),
          stack(
            [
              element('div', { className: 'path-template-section-title' }, [
                element('h3', {
                  text: (current) =>
                    translate(current, 'schemaCaptureSourcesAttachmentPathGroupTitle')
                })
              ]),
              {
                kind: 'rows',
                items: [
                  {
                    kind: 'row',
                    title: (current) =>
                      translate(current, 'schemaCaptureSourcesScreenshotLocationTitle'),
                    description: (current) =>
                      translate(current, 'schemaCaptureSourcesScreenshotLocationDescription'),
                    control: boundInput({
                      bind: 'videoScreenshotAttachmentLocationTemplate',
                      mono: true,
                      onInput: {
                        id: 'options:updateField',
                        args: ['video.screenshotAttachment.locationTemplate'],
                        valueFrom: 'target.value'
                      }
                    })
                  },
                  {
                    kind: 'row',
                    title: (current) =>
                      translate(current, 'schemaCaptureSourcesScreenshotFilenameTitle'),
                    description: (current) =>
                      translate(current, 'schemaCaptureSourcesScreenshotFilenameDescription'),
                    control: boundInput({
                      bind: 'videoScreenshotAttachmentFileNameTemplate',
                      mono: true,
                      onInput: {
                        id: 'options:updateField',
                        args: ['video.screenshotAttachment.fileNameTemplate'],
                        valueFrom: 'target.value'
                      }
                    })
                  },
                  {
                    kind: 'row',
                    title: (current) => translate(current, 'schemaCaptureSourcesMarkdownUrlTitle'),
                    description: (current) =>
                      translate(current, 'schemaCaptureSourcesMarkdownUrlDescription'),
                    control: boundInput({
                      bind: 'videoScreenshotAttachmentMarkdownUrlFormat',
                      mono: true,
                      onInput: {
                        id: 'options:updateField',
                        args: ['video.screenshotAttachment.markdownUrlFormat'],
                        valueFrom: 'target.value'
                      }
                    })
                  }
                ]
              },
              element('p', { className: 'template-helper attachment-path-guidance' }, [
                element('span', {
                  text: (current) =>
                    translate(current, 'schemaCaptureSourcesAttachmentGuidancePrefix')
                }),
                element('a', {
                  text: (current) =>
                    translate(current, 'schemaCaptureSourcesAttachmentGuidanceLink'),
                  href: 'https://github.com/mnaoumov/obsidian-custom-attachment-location',
                  target: '_blank',
                  rel: 'noopener noreferrer'
                }),
                element('span', {
                  text: (current) =>
                    translate(current, 'schemaCaptureSourcesAttachmentGuidanceSuffix')
                })
              ])
            ],
            'video-attachment-path-config u-mt-block'
          )
        ]
      }
    ]
  };
}
