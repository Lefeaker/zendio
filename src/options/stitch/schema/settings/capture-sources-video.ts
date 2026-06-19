import type { GroupNode, SchemaContext } from '../../types';
import {
  getDefaultProductionEnglishMessage,
  type SchemaMessageKey,
  type SchemaMessageValues
} from '../i18n';
import { boundInput, boundSwitch } from '../builders/controls';
import { element, grid, paragraph, stack } from '../builders/primitives';

function translate(
  current: SchemaContext,
  key: SchemaMessageKey,
  values?: SchemaMessageValues
): string {
  const fallback = getDefaultProductionEnglishMessage(key, values);
  return current.t ? current.t(key, fallback, values) : fallback;
}

function createVideoPromptHelper(): ReturnType<typeof element> {
  return element('p', { className: 'video-prompt-helper' }, [
    element('span', {
      text: (current) => translate(current, 'schemaCaptureSourcesVideoPromptIntroPrefix')
    }),
    element('a', {
      text: (current) => translate(current, 'schemaCaptureSourcesVideoYoutubeLabel'),
      href: 'https://www.youtube.com/',
      target: '_blank',
      rel: 'noopener noreferrer'
    }),
    element('span', {
      text: (current) => translate(current, 'schemaCaptureSourcesVideoPromptPlatformJoiner')
    }),
    element('a', {
      text: (current) => translate(current, 'schemaCaptureSourcesVideoBilibiliLabel'),
      href: 'https://www.bilibili.com/',
      target: '_blank',
      rel: 'noopener noreferrer'
    }),
    element('span', {
      text: (current) => translate(current, 'schemaCaptureSourcesVideoPromptIntroSuffix')
    }),
    element('span', {
      text: (current) => translate(current, 'schemaCaptureSourcesVideoPromptGreyDotLabel')
    }),
    element('span', {
      className: 'video-screenshot-dot-example is-empty',
      role: 'img',
      ariaLabel: (current) => translate(current, 'schemaCaptureSourcesVideoPromptGreyDotLabel')
    }),
    element('span', {
      text: (current) => translate(current, 'schemaCaptureSourcesVideoPromptGreyDotDescription')
    }),
    element('span', {
      text: (current) => translate(current, 'schemaCaptureSourcesVideoPromptGreenDotLabel')
    }),
    element('span', {
      className: 'video-screenshot-dot-example is-saved',
      role: 'img',
      ariaLabel: (current) => translate(current, 'schemaCaptureSourcesVideoPromptGreenDotLabel')
    }),
    element('span', {
      text: (current) => translate(current, 'schemaCaptureSourcesVideoPromptGreenDotDescription')
    }),
    element('span', {
      text: (current) => translate(current, 'schemaCaptureSourcesVideoPromptToggleHint')
    })
  ]);
}

function templateInputWithHelper(
  bind: string,
  argsPath: string,
  descriptionKey: SchemaMessageKey
): ReturnType<typeof stack> {
  return stack(
    [
      boundInput({
        bind,
        mono: true,
        onInput: {
          id: 'options:updateField',
          args: [argsPath],
          valueFrom: 'target.value'
        }
      }),
      paragraph((current) => translate(current, descriptionKey), 'template-row-helper')
    ],
    'template-row-control'
  );
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
          createVideoPromptHelper(),
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
                    control: templateInputWithHelper(
                      'videoScreenshotAttachmentLocationTemplate',
                      'video.screenshotAttachment.locationTemplate',
                      'schemaCaptureSourcesScreenshotLocationDescription'
                    )
                  },
                  {
                    kind: 'row',
                    title: (current) =>
                      translate(current, 'schemaCaptureSourcesScreenshotFilenameTitle'),
                    control: templateInputWithHelper(
                      'videoScreenshotAttachmentFileNameTemplate',
                      'video.screenshotAttachment.fileNameTemplate',
                      'schemaCaptureSourcesScreenshotFilenameDescription'
                    )
                  },
                  {
                    kind: 'row',
                    title: (current) => translate(current, 'schemaCaptureSourcesMarkdownUrlTitle'),
                    control: templateInputWithHelper(
                      'videoScreenshotAttachmentMarkdownUrlFormat',
                      'video.screenshotAttachment.markdownUrlFormat',
                      'schemaCaptureSourcesMarkdownUrlDescription'
                    )
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
