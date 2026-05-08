import type { SettingsSchema } from '../../types';
import { emptyState, grid } from '../builders/primitives';
import { aiPlatformLinks } from '../builders/settings';
import { boundInput, boundSwitch } from '../builders/controls';

const schema: SettingsSchema = {
  createView(ctx) {
    return {
      id: 'capture-sources',
      kind: 'page',
      hero: ctx.appData.captureSources.hero,
      children: [
        {
          kind: 'group',
          title: 'AI Chat',
          children: [
            {
              kind: 'card',
              title: 'AI Conversation Capture',
              description: '配置 AI 对话导出时的来源和显示行为。',
              actions: [{ kind: 'badge', label: '8 supported platforms', variant: 'success' }],
              body: [
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: '支持平台',
                      description: '当前已适配的 AI 网站应可见，方便用户理解功能覆盖范围。',
                      control: aiPlatformLinks()
                    },
                    {
                      kind: 'row',
                      title: '用户显示名',
                      description: '控制 AI 对话导出时用户消息的显示名称。',
                      control: grid(
                        2,
                        [
                          {
                            kind: 'field',
                            label: 'userName',
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
                            label: 'Preview',
                            control: emptyState(
                              (current) => `默认显示为 \`${current.state.aiUserName ?? 'USER'}\`。`
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
          title: 'Video',
          children: [
            {
              kind: 'card',
              title: 'Video Prompt & Entry',
              description: '配置视频站点控制栏笔记入口。',
              body: [
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: '在视频网站显示笔记按钮',
                      description: '控制 YouTube / 哔哩哔哩视频控制栏里的笔记入口。',
                      control: boundSwitch({
                        bind: 'videoFloatingPromptEnabled',
                        stateText: (current) =>
                          current.state.videoFloatingPromptEnabled ? '已开启' : '已关闭',
                        onChange: {
                          id: 'options:updateField',
                          args: ['video.floatingPromptEnabled'],
                          valueFrom: 'target.checked'
                        }
                      })
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    };
  }
};

export default schema;
