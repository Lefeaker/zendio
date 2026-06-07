import type { SettingsSchema, SchemaContext } from '../../types';
import type { SchemaMessageKey, SchemaMessageValues } from '../i18n';
import { emptyState, grid } from '../builders/primitives';
import { aiPlatformLinks } from '../builders/settings';
import { boundInput, boundSwitch } from '../builders/controls';

function translate(
  current: SchemaContext,
  key: SchemaMessageKey,
  fallback: string,
  values?: SchemaMessageValues
): string {
  return current.t ? current.t(key, fallback, values) : fallback;
}

const schema: SettingsSchema = {
  createView(ctx) {
    const hero = ctx.appData.captureSources.hero;

    return {
      id: 'capture-sources',
      kind: 'page',
      hero: {
        ...hero,
        title: translate(ctx, 'schemaCaptureSourcesTitle', hero.title),
        description: translate(ctx, 'schemaCaptureSourcesHeroDescription', hero.description)
      },
      children: [
        {
          kind: 'group',
          title: translate(ctx, 'schemaCaptureSourcesAiChatGroupTitle', 'AI Chat'),
          children: [
            {
              kind: 'card',
              title: translate(
                ctx,
                'schemaCaptureSourcesAiConversationTitle',
                'AI Conversation Capture'
              ),
              description: translate(
                ctx,
                'schemaCaptureSourcesAiConversationDescription',
                '配置 AI 对话导出时的来源和显示行为。'
              ),
              actions: [
                {
                  kind: 'badge',
                  label: translate(
                    ctx,
                    'schemaCaptureSourcesAiSupportedPlatformsBadge',
                    '8 supported platforms'
                  ),
                  variant: 'success'
                }
              ],
              body: [
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: translate(ctx, 'videoSupportedPlatformsTitle', '支持平台'),
                      description: translate(
                        ctx,
                        'schemaCaptureSourcesSupportedPlatformsDescription',
                        '当前已适配的 AI 网站应可见，方便用户理解功能覆盖范围。'
                      ),
                      control: aiPlatformLinks()
                    },
                    {
                      kind: 'row',
                      title: translate(ctx, 'aiSummaryUserName', '用户显示名'),
                      description: translate(
                        ctx,
                        'schemaCaptureSourcesUserDisplayNameDescription',
                        '控制 AI 对话导出时用户消息的显示名称。'
                      ),
                      control: grid(
                        2,
                        [
                          {
                            kind: 'field',
                            label: translate(ctx, 'userNameLabel', 'userName'),
                            control: boundInput({
                              bind: 'aiUserName',
                              onInput: {
                                id: 'options:updateField',
                                args: ['aiChat.userName'],
                                valueFrom: 'target.value'
                              }
                            })
                          },
                          {
                            kind: 'field',
                            label: translate(
                              ctx,
                              'schemaCaptureSourcesPreviewFieldLabel',
                              'Preview'
                            ),
                            control: emptyState((current) =>
                              translate(
                                current,
                                'schemaCaptureSourcesUserDisplayNamePreview',
                                '默认显示为 `{label}`。',
                                { label: current.state.aiUserName ?? 'USER' }
                              )
                            )
                          }
                        ],
                        'field-grid-2'
                      )
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: translate(ctx, 'schemaCaptureSourcesVideoGroupTitle', 'Video'),
          children: [
            {
              kind: 'card',
              title: translate(
                ctx,
                'schemaCaptureSourcesVideoPromptEntryTitle',
                'Video Prompt & Entry'
              ),
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
                      title: translate(ctx, 'videoFloatingPromptLabel', '在视频网站显示笔记按钮'),
                      description: translate(
                        ctx,
                        'videoFloatingPromptHint',
                        '控制 YouTube / 哔哩哔哩视频控制栏里的笔记入口。'
                      ),
                      control: boundSwitch({
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
                    },
                    {
                      kind: 'row',
                      title: translate(
                        ctx,
                        'schemaCaptureSourcesAutoPauseTitle',
                        '编辑批注时自动暂停视频播放'
                      ),
                      description: translate(
                        ctx,
                        'schemaCaptureSourcesAutoPauseDescription',
                        '开启后在视频模式里编辑时间戳批注时会暂停当前视频。'
                      ),
                      control: boundSwitch({
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
                    },
                    {
                      kind: 'row',
                      title: translate(
                        ctx,
                        'schemaCaptureSourcesScreenshotLocationTitle',
                        '附件位置模板'
                      ),
                      description: translate(
                        ctx,
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
                      title: translate(
                        ctx,
                        'schemaCaptureSourcesScreenshotFilenameTitle',
                        '附件文件名模板'
                      ),
                      description: translate(
                        ctx,
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
                      title: translate(
                        ctx,
                        'schemaCaptureSourcesMarkdownUrlTitle',
                        'Markdown URL 格式'
                      ),
                      description: translate(
                        ctx,
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
                emptyState(
                  translate(
                    ctx,
                    'schemaCaptureSourcesVideoPromptHelper',
                    '控制 YouTube / 哔哩哔哩视频控制栏里的笔记入口。灰色圆点表示该时间戳尚未保存截图，绿色圆点表示该时间戳已有截图。'
                  )
                )
              ]
            }
          ]
        }
      ]
    };
  }
};

export default schema;
