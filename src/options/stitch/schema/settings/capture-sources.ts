import type { SettingsSchema, SchemaContext } from '../../types';
import type { SchemaMessageKey, SchemaMessageValues } from '../i18n';
import { emptyState, grid } from '../builders/primitives';
import { aiPlatformLinks } from '../builders/settings';
import { boundInput } from '../builders/controls';
import { createVideoCaptureSourcesGroup } from './capture-sources-video';

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
        createVideoCaptureSourcesGroup(ctx)
      ]
    };
  }
};

export default schema;
