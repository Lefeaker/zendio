import type { SettingsSchema } from '../../types';
import { div, paragraph, stack, state, strong } from '../builders/primitives';
import { classNames } from '../builders/classNames';
import { themeSegmentedSwitch } from '../builders/settings';
import { boundSwitch } from '../builders/controls';

const schema: SettingsSchema = {
  createView(ctx) {
    return {
      id: 'overview',
      kind: 'page',
      hero: ctx.appData.overview.hero,
      children: [
        {
          kind: 'group',
          title: '使用概览',
          children: [
            {
              kind: 'card',
              title: 'Usage Dashboard',
              description: '查看保存总量、内容分布和最近使用趋势。',
              actions: [
                {
                  kind: 'button',
                  label: '打开 Diagnosis',
                  variant: 'secondary',
                  action: { id: 'navigation:scrollToPanel', args: ['maintenance'] }
                },
                {
                  kind: 'button',
                  label: '清除使用数据',
                  variant: 'danger',
                  action: { id: 'overview:clearUsageData' }
                }
              ],
              body: [
                { kind: 'statsGrid', items: (current) => current.appData.overview.stats },
                { kind: 'usageChart' }
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: '界面',
          children: [
            {
              kind: 'card',
              body: [
                div(classNames.settings.interfaceThemeGrid, [
                  {
                    kind: 'field',
                    label: '界面语言',
                    control: {
                      kind: 'select',
                      options: (current) => current.appData.languageOptions,
                      bind: 'previewLanguage',
                      onChange: {
                        id: 'preview:setLanguage',
                        valueFrom: 'target.value'
                      }
                    }
                  },
                  {
                    kind: 'field',
                    label: '界面主题',
                    control: themeSegmentedSwitch()
                  }
                ])
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: '隐私与数据',
          children: [
            {
              kind: 'card',
              title: 'Consent',
              description: '管理匿名使用统计、错误报告和相关数据说明。',
              body: [
                div('consent-inline-grid', [
                  div('consent-inline-item', [
                    div('consent-inline-head', [
                      strong('匿名使用统计'),
                      boundSwitch({
                        bind: 'privacyAnalytics',
                        compact: true,
                        onChange: {
                          id: 'overview:updatePrivacyConsent',
                          args: ['analytics'],
                          valueFrom: 'target.checked'
                        }
                      })
                    ]),
                    paragraph(
                      '记录功能使用次数，用于 Usage Dashboard 和行为统计。',
                      'consent-inline-copy'
                    )
                  ]),
                  div('consent-inline-item', [
                    div('consent-inline-head', [
                      strong('错误报告'),
                      boundSwitch({
                        bind: 'privacyErrorReporting',
                        compact: true,
                        onChange: {
                          id: 'overview:updatePrivacyConsent',
                          args: ['errorReporting'],
                          valueFrom: 'target.checked'
                        }
                      })
                    ]),
                    paragraph('帮助定位崩溃与异常。', 'consent-inline-copy')
                  ])
                ]),
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: '调试模式',
                      description: '仅开发环境可见，需要 analytics 与 error reporting 都启用。',
                      control: stack(
                        [
                          boundSwitch({
                            bind: 'privacyDebugMode',
                            compact: true,
                            disabled: (current) =>
                              !current.state.privacyAnalytics ||
                              !current.state.privacyErrorReporting,
                            onChange: {
                              id: 'overview:updatePrivacyConsent',
                              args: ['debugMode'],
                              valueFrom: 'target.checked'
                            }
                          }),
                          { kind: 'badge', label: 'Dev-only', variant: 'warning' },
                          state((current) =>
                            current.state.privacyAnalytics && current.state.privacyErrorReporting
                              ? '可用'
                              : '前置条件未满足'
                          )
                        ],
                        'switch-line debug-mode-inline'
                      )
                    }
                  ]
                },
                div('mini-card u-mt-block', [
                  strong('What Data Means'),
                  div('data-means-grid u-mt-tight', [
                    div('data-means-block', [
                      strong('会收集', 'data-means-title'),
                      {
                        kind: 'list',
                        items: (current) => current.appData.privacyCollected
                      }
                    ]),
                    div('data-means-block', [
                      strong('不会收集', 'data-means-title'),
                      {
                        kind: 'list',
                        items: (current) => current.appData.privacyExcluded
                      }
                    ]),
                    div('data-means-actions', [
                      {
                        kind: 'button',
                        label: '清空全部分析数据',
                        variant: 'danger',
                        action: { id: 'overview:clearAnalyticsData' }
                      },
                      {
                        kind: 'button',
                        label: '隐私政策',
                        variant: 'ghost',
                        action: { id: 'resource:open', args: ['privacy-policy'] }
                      },
                      {
                        kind: 'button',
                        label: '数据用途说明',
                        variant: 'ghost',
                        action: { id: 'resource:open', args: ['data-usage'] }
                      }
                    ]),
                    state((current) => current.state.privacyStatus ?? '')
                  ])
                ])
              ]
            }
          ]
        }
      ]
    };
  }
};

export default schema;
