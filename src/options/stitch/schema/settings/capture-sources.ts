import type { SettingsSchema } from '../../types';
import { emptyState, grid, paragraph } from '../builders/primitives';
import {
  aiPlatformLinks,
  deepResearchPurifyAction,
  deepResearchPurifyNotice
} from '../builders/settings';
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
                    },
                    {
                      kind: 'row',
                      title: '包含时间戳',
                      description: '控制 AI 对话导出时是否保留每条消息的时间戳。',
                      control: boundSwitch({
                        bind: 'aiIncludeTimestamps',
                        stateText: (current) =>
                          current.state.aiIncludeTimestamps ? '已开启' : '已关闭',
                        onChange: {
                          id: 'options:updateField',
                          args: ['aiChat.includeTimestamps'],
                          valueFrom: 'target.checked'
                        }
                      })
                    }
                  ]
                }
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: 'Deep Research',
          children: [
            {
              kind: 'card',
              title: 'Gemini Deep Research',
              description: '控制 Deep Research 报告的捕获方式。',
              actions: [deepResearchPurifyAction()],
              body: [deepResearchPurifyNotice()]
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
              description: '配置视频站点的浮动提示入口和行为。',
              body: [
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: '在视频网站显示浮动提示',
                      description: '控制 YouTube / 哔哩哔哩右下角的提示按钮。',
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
                    },
                    {
                      kind: 'row',
                      title: '提示文案与快捷键',
                      description: 'promptButtonLabel 与 promptShortcut 都是正式选项。',
                      control: grid(
                        2,
                        [
                          {
                            kind: 'field',
                            label: 'promptButtonLabel',
                            control: boundInput({
                              bind: 'videoPromptButtonLabel',
                              onInput: {
                                id: 'options:updateField',
                                args: ['video.promptButtonLabel'],
                                valueFrom: 'target.value'
                              }
                            })
                          },
                          {
                            kind: 'field',
                            label: 'promptShortcut',
                            control: boundInput({
                              bind: 'videoPromptShortcut',
                              mono: true,
                              onInput: {
                                id: 'options:updateField',
                                args: ['video.promptShortcut'],
                                valueFrom: 'target.value'
                              }
                            })
                          }
                        ],
                        'field-grid-2'
                      )
                    },
                    {
                      kind: 'row',
                      title: '已适配平台',
                      description: '来源型模块应展示平台覆盖。',
                      control: grid(2, [
                        {
                          kind: 'miniCard',
                          title: 'YouTube',
                          content: paragraph('支持 watch / short 页面，自动显示浮动提示按钮。')
                        },
                        {
                          kind: 'miniCard',
                          title: '哔哩哔哩',
                          content: paragraph('支持 BV / AV 视频页，带快捷键提示和弹幕区兼容说明。')
                        }
                      ])
                    }
                  ]
                },
                {
                  kind: 'details',
                  summary: 'Advanced Video Schema',
                  children: [
                    grid(
                      3,
                      [
                        {
                          kind: 'field',
                          label: 'promptPosition.x',
                          control: boundInput({
                            bind: 'videoPromptPositionX',
                            mono: true,
                            type: 'number',
                            onInput: {
                              id: 'options:updateField',
                              args: ['video.promptPosition.x'],
                              valueFrom: 'target.value'
                            }
                          })
                        },
                        {
                          kind: 'field',
                          label: 'promptPosition.y',
                          control: boundInput({
                            bind: 'videoPromptPositionY',
                            mono: true,
                            type: 'number',
                            onInput: {
                              id: 'options:updateField',
                              args: ['video.promptPosition.y'],
                              valueFrom: 'target.value'
                            }
                          })
                        },
                        {
                          kind: 'field',
                          label: 'Status',
                          control: emptyState('可选。保存浮动提示按钮位置。')
                        }
                      ],
                      'field-grid-3'
                    )
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
