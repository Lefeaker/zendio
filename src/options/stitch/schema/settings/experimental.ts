import type { SettingsSchema } from '../../types';
import { div, grid, paragraph, strong } from '../builders/primitives';
import { boundInput, boundSelect, boundSwitch, boundTextarea } from '../builders/controls';
import { infoBox } from '../builders/chrome';

const schema: SettingsSchema = {
  createView(ctx) {
    return {
      id: 'experimental',
      kind: 'page',
      hero: ctx.appData.experimental.hero,
      children: [
        {
          kind: 'group',
          title: 'AI Service',
          children: [
            {
              kind: 'card',
              title: 'Shared AI Connection',
              description:
                '敬请期待 / Coming soon：当前版本尚未提供摘要生成、阅读模式摘要展示或字幕翻译 runtime。',
              body: [
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: '连接参数',
                      description:
                        '共享 AI 连接参数仅作为未来能力预留；当前版本不可编辑，也不会触发摘要或翻译请求。',
                      control: grid(
                        2,
                        [
                          {
                            kind: 'field',
                            label: 'Provider',
                            control: boundSelect({
                              bind: 'experimentalAiConfig.provider',
                              options: (current) => current.appData.experimental.providerOptions,
                              disabled: true
                            })
                          },
                          {
                            kind: 'field',
                            label: 'Model',
                            control: boundInput({
                              bind: 'experimentalAiConfig.model',
                              disabled: true
                            })
                          },
                          {
                            kind: 'field',
                            label: 'API URL',
                            control: boundInput({
                              bind: 'experimentalAiConfig.apiUrl',
                              mono: true,
                              disabled: true
                            })
                          },
                          {
                            kind: 'field',
                            label: 'API Key',
                            control: boundInput({
                              bind: 'experimentalAiConfig.apiKey',
                              mono: true,
                              type: 'password',
                              placeholder: 'sk-...',
                              disabled: true
                            })
                          }
                        ],
                        'field-grid-2'
                      )
                    }
                  ]
                },
                infoBox(
                  '敬请期待 / Coming soon',
                  '当前版本尚未提供摘要生成、阅读模式摘要展示或字幕翻译 runtime；这些字段只是未来能力的 UI 占位。'
                )
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: 'Classifier',
          children: [
            {
              kind: 'card',
              title: 'AI 辅助分类与总结',
              description: '迁移旧生产 Classifier 配置，供剪藏路径与分类 fallback 使用。',
              body: [
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: '启用智能分类',
                      description: '启用后，剪藏流程会请求配置的分类模型。',
                      control: boundSwitch({
                        bind: 'classifierEnabled',
                        compact: true,
                        onChange: {
                          id: 'classifier:updateField',
                          args: ['enabled'],
                          valueFrom: 'target.checked'
                        }
                      })
                    },
                    {
                      kind: 'row',
                      title: '模型连接',
                      description:
                        'Provider、Endpoint、Model 和 API Key 与旧生产 Classifier 设置一致。',
                      control: grid(
                        2,
                        [
                          {
                            kind: 'field',
                            label: 'Provider',
                            control: boundSelect({
                              bind: 'classifierProvider',
                              options: [
                                { value: 'ollama', label: 'Ollama' },
                                { value: 'openai', label: 'OpenAI' },
                                { value: 'compatible', label: 'Compatible' }
                              ],
                              onChange: {
                                id: 'classifier:updateField',
                                args: ['provider'],
                                valueFrom: 'target.value'
                              }
                            })
                          },
                          {
                            kind: 'field',
                            label: 'Model',
                            control: boundInput({
                              bind: 'classifierModel',
                              onInput: {
                                id: 'classifier:updateField',
                                args: ['model'],
                                valueFrom: 'target.value'
                              }
                            })
                          },
                          {
                            kind: 'field',
                            label: 'Endpoint',
                            control: boundInput({
                              bind: 'classifierEndpoint',
                              mono: true,
                              onInput: {
                                id: 'classifier:updateField',
                                args: ['endpoint'],
                                valueFrom: 'target.value'
                              }
                            })
                          },
                          {
                            kind: 'field',
                            label: 'API Key',
                            control: boundInput({
                              bind: 'classifierApiKey',
                              mono: true,
                              type: 'password',
                              onInput: {
                                id: 'classifier:updateField',
                                args: ['apiKey'],
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
                      title: 'Taxonomy JSON',
                      description:
                        '保持旧生产 taxonomy JSON 编辑入口；无效 JSON 不会覆盖上一次有效配置。',
                      control: boundTextarea({
                        bind: 'classifierTaxonomyText',
                        className: 'code classifier-taxonomy',
                        onInput: {
                          id: 'classifier:updateField',
                          args: ['taxonomy'],
                          valueFrom: 'target.value'
                        }
                      })
                    }
                  ]
                },
                infoBox(
                  '稳定性说明',
                  '分类功能仍由后台现有 classification pipeline 执行；这里仅迁移已有配置入口。'
                )
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: 'Page Summary',
          children: [
            {
              kind: 'card',
              title: 'AI Page Summary',
              description:
                '敬请期待 / Coming soon：当前版本尚未提供页面摘要生成或阅读模式摘要展示 runtime。',
              body: [
                div('summary-toggle-grid', [
                  div('summary-toggle-item', [
                    div('summary-toggle-head', [
                      strong('保存页面时生成 AI 总结'),
                      boundSwitch({
                        bind: 'pageSummaryEnabled',
                        disabled: true,
                        compact: true
                      })
                    ]),
                    paragraph(
                      '敬请期待 / Coming soon：当前版本尚未提供摘要生成，也不会把 AI 总结插入导出的 Markdown。'
                    )
                  ]),
                  div('summary-toggle-item', [
                    div('summary-toggle-head', [
                      strong('在阅读模式顶部显示页面总结'),
                      boundSwitch({
                        bind: 'readingOverlaySummaryEnabled',
                        disabled: true,
                        compact: true
                      })
                    ]),
                    paragraph('敬请期待 / Coming soon：当前版本尚未提供阅读模式摘要展示 runtime。')
                  ])
                ]),
                infoBox(
                  '敬请期待 / Coming soon',
                  '这两个开关是 Stitch Secondary 视觉占位。当前版本保留配置结构，但生产 collectDraft 会强制保持 disabled。'
                )
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: 'Subtitle Translation',
          children: [
            {
              kind: 'card',
              title: 'Video Subtitle Translation',
              description: '敬请期待 / Coming soon：当前版本尚未提供视频字幕翻译 runtime。',
              body: [
                div('subtitle-inline-grid', [
                  div('subtitle-inline-item', [
                    div('subtitle-inline-head', [
                      strong('启用视频字幕翻译'),
                      boundSwitch({
                        bind: 'subtitleTranslationEnabled',
                        disabled: true,
                        compact: true
                      })
                    ]),
                    paragraph('敬请期待 / Coming soon：当前版本不会翻译或展示视频字幕。')
                  ]),
                  {
                    kind: 'field',
                    label: '翻译目标语言',
                    control: boundSelect({
                      bind: 'subtitleTargetLanguage',
                      options: (current) => current.appData.experimental.subtitleLanguages,
                      disabled: true
                    })
                  }
                ]),
                infoBox(
                  '敬请期待 / Coming soon',
                  '目标语言只保留现有值用于未来迁移；当前 UI 不允许用户误以为字幕翻译已可用。'
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
