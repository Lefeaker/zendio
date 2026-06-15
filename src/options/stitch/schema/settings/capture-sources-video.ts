import type { GroupNode, SchemaContext } from '../../types';
import type { SchemaMessageKey, SchemaMessageValues } from '../i18n';
import { boundInput, boundSwitch } from '../builders/controls';
import { element, emptyState, grid, stack } from '../builders/primitives';
import { DEFAULT_PRODUCTION_ENGLISH_MESSAGES } from '../i18n';

function translate(
  current: SchemaContext,
  key: SchemaMessageKey,
  fallback: string,
  values?: SchemaMessageValues
): string {
  return current.t ? current.t(key, fallback, values) : fallback;
}

export function createVideoCaptureSourcesGroup(ctx: SchemaContext): GroupNode {
  return {
    kind: 'group',
    title: translate(ctx, 'schemaCaptureSourcesVideoGroupTitle', 'Video'),
    children: [
      {
        kind: 'card',
        title: translate(ctx, 'schemaCaptureSourcesVideoPromptEntryTitle', 'Video Prompt & Entry'),
        description: translate(
          ctx,
          'schemaCaptureSourcesVideoPromptEntryDescription',
          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureSourcesVideoPromptEntryDescription
        ),
        body: [
          {
            kind: 'rows',
            items: [
              {
                kind: 'row',
                title: translate(
                  ctx,
                  'schemaCaptureSourcesVideoEntryBehaviorTitle',
                  DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureSourcesVideoEntryBehaviorTitle
                ),
                description: translate(
                  ctx,
                  'schemaCaptureSourcesVideoEntryBehaviorDescription',
                  DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureSourcesVideoEntryBehaviorDescription
                ),
                control: grid(
                  2,
                  [
                    element('div', { className: 'video-entry-toggle' }, [
                      element('span', {
                        text: (current) =>
                          translate(
                            current,
                            'schemaCaptureSourcesVideoNoteButtonLabel',
                            DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureSourcesVideoNoteButtonLabel
                          )
                      }),
                      boundSwitch({
                        bind: 'videoFloatingPromptEnabled',
                        compact: true,
                        stateText: (current) =>
                          current.state.videoFloatingPromptEnabled
                            ? translate(
                                current,
                                'schemaCommonEnabledState',
                                DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCommonEnabledState
                              )
                            : translate(
                                current,
                                'schemaCommonDisabledState',
                                DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCommonDisabledState
                              ),
                        onChange: {
                          id: 'options:updateField',
                          args: ['video.floatingPromptEnabled'],
                          valueFrom: 'target.checked'
                        }
                      })
                    ]),
                    element('div', { className: 'video-entry-toggle' }, [
                      element('span', {
                        text: (current) =>
                          translate(
                            current,
                            'schemaCaptureSourcesAutoPauseTitle',
                            DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureSourcesAutoPauseTitle
                          )
                      }),
                      boundSwitch({
                        bind: 'videoCommentEditorAutoPause',
                        compact: true,
                        stateText: (current) =>
                          current.state.videoCommentEditorAutoPause
                            ? translate(
                                current,
                                'schemaCommonEnabledState',
                                DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCommonEnabledState
                              )
                            : translate(
                                current,
                                'schemaCommonDisabledState',
                                DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCommonDisabledState
                              ),
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
          emptyState(
            translate(
              ctx,
              'schemaCaptureSourcesVideoPromptHelper',
              DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureSourcesVideoPromptHelper
            )
          ),
          stack(
            [
              element('div', { className: 'path-template-section-title' }, [
                element('h3', {
                  text: (current) =>
                    translate(
                      current,
                      'schemaCaptureSourcesAttachmentPathGroupTitle',
                      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureSourcesAttachmentPathGroupTitle
                    )
                })
              ]),
              {
                kind: 'rows',
                items: [
                  {
                    kind: 'row',
                    title: (current) =>
                      translate(
                        current,
                        'schemaCaptureSourcesScreenshotLocationTitle',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureSourcesScreenshotLocationTitle
                      ),
                    description: (current) =>
                      translate(
                        current,
                        'schemaCaptureSourcesScreenshotLocationDescription',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureSourcesScreenshotLocationDescription
                      ),
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
                      translate(
                        current,
                        'schemaCaptureSourcesScreenshotFilenameTitle',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureSourcesScreenshotFilenameTitle
                      ),
                    description: (current) =>
                      translate(
                        current,
                        'schemaCaptureSourcesScreenshotFilenameDescription',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureSourcesScreenshotFilenameDescription
                      ),
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
                    title: (current) =>
                      translate(
                        current,
                        'schemaCaptureSourcesMarkdownUrlTitle',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureSourcesMarkdownUrlTitle
                      ),
                    description: (current) =>
                      translate(
                        current,
                        'schemaCaptureSourcesMarkdownUrlDescription',
                        DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureSourcesMarkdownUrlDescription
                      ),
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
                    translate(
                      current,
                      'schemaCaptureSourcesAttachmentGuidancePrefix',
                      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureSourcesAttachmentGuidancePrefix
                    )
                }),
                element('a', {
                  text: (current) =>
                    translate(
                      current,
                      'schemaCaptureSourcesAttachmentGuidanceLink',
                      'Custom Attachment Location'
                    ),
                  href: 'https://github.com/mnaoumov/obsidian-custom-attachment-location',
                  target: '_blank',
                  rel: 'noopener noreferrer'
                }),
                element('span', {
                  text: (current) =>
                    translate(
                      current,
                      'schemaCaptureSourcesAttachmentGuidanceSuffix',
                      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaCaptureSourcesAttachmentGuidanceSuffix
                    )
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
