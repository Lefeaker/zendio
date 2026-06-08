import type { GroupNode, SchemaContext } from '../../types';
import type { SchemaMessageKey, SchemaMessageValues } from '../i18n';
import { boundInput, boundSwitch } from '../builders/controls';
import { element, emptyState, grid, stack } from '../builders/primitives';

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
          '配置视频站点控制栏笔记入口。'
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
                  '视频入口与编辑行为'
                ),
                description: translate(
                  ctx,
                  'schemaCaptureSourcesVideoEntryBehaviorDescription',
                  '控制视频网站笔记入口，以及编辑批注时的视频播放状态。'
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
                            '在视频网站显示笔记按钮'
                          )
                      }),
                      boundSwitch({
                        bind: 'videoFloatingPromptEnabled',
                        compact: true,
                        stateText: (current) =>
                          current.state.videoFloatingPromptEnabled
                            ? translate(current, 'schemaCommonEnabledState', '已开启')
                            : translate(current, 'schemaCommonDisabledState', '已关闭'),
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
                            '编辑批注时自动暂停视频播放'
                          )
                      }),
                      boundSwitch({
                        bind: 'videoCommentEditorAutoPause',
                        compact: true,
                        stateText: (current) =>
                          current.state.videoCommentEditorAutoPause
                            ? translate(current, 'schemaCommonEnabledState', '已开启')
                            : translate(current, 'schemaCommonDisabledState', '已关闭'),
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
              '控制 YouTube / 哔哩哔哩视频控制栏里的笔记入口。灰色圆点表示该时间戳尚未保存截图，绿色圆点表示该时间戳已有截图。'
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
                      '附件路径配置'
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
                        '附件位置模板'
                      ),
                    description: (current) =>
                      translate(
                        current,
                        'schemaCaptureSourcesScreenshotLocationDescription',
                        '例如 `./assets/${noteFileName}`，用于截图附件保存目录。'
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
                        '附件文件名模板'
                      ),
                    description: (current) =>
                      translate(
                        current,
                        'schemaCaptureSourcesScreenshotFilenameDescription',
                        "例如 `file-${date:{momentJsFormat:'YYYYMMDDHHmmssSSS'}}.jpg`，用于截图文件名。"
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
                        'Markdown URL 格式'
                      ),
                    description: (current) =>
                      translate(
                        current,
                        'schemaCaptureSourcesMarkdownUrlDescription',
                        '留空时使用默认写法，可按当前导出链路填写 Markdown 链接模板。'
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
                      '附件内容配置与 Obsidian 插件 '
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
                      ' 配合使用更佳，保持 Obsidian 内该插件配置与此处一致。'
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
