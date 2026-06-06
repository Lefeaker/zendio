import type { SettingsSchema } from '../../types';
import { grid, htmlParagraph, paragraph, stack } from '../builders/primitives';
import { boundInput, boundSelect, boundSwitch } from '../builders/controls';
import {
  fragmentModifierChipItems,
  fragmentModifierStateWarning
} from '@options/app/fragmentModifierOptions';

const schema: SettingsSchema = {
  createView(ctx) {
    return {
      id: 'capture-behavior',
      kind: 'page',
      hero: ctx.appData.captureBehavior.hero,
      children: [
        {
          kind: 'group',
          title: 'Reading Mode',
          children: [
            {
              kind: 'card',
              title: 'Reading Export',
              description: '设置阅读模式导出方式和高亮主题。',
              body: [
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: '导出内容',
                      description: '决定保存高亮片段，还是保存全文并标注高亮。',
                      control: {
                        kind: 'select',
                        options: [
                          { value: 'highlights', label: '仅保存高亮片段' },
                          { value: 'full', label: '保存全文并标注高亮' }
                        ],
                        bind: 'readingExportMode',
                        onChange: {
                          id: 'options:updateField',
                          args: ['readingSession.exportMode'],
                          valueFrom: 'target.value'
                        }
                      }
                    },
                    {
                      kind: 'row',
                      title: '高亮主题',
                      description: '仅影响阅读模式页面里的高亮呈现，不改变导出的 Markdown 内容。',
                      control: stack([
                        {
                          kind: 'segmentedNav',
                          items: [
                            { value: 'gradient', label: 'Gradient' },
                            { value: 'purple', label: 'Purple' },
                            { value: 'neonYellow', label: 'Neon Yellow' },
                            { value: 'neonGreen', label: 'Neon Green' },
                            { value: 'neonOrange', label: 'Neon Orange' }
                          ],
                          bind: 'highlightTheme',
                          action: { id: 'highlight:setTheme' }
                        },
                        { kind: 'highlightExample' }
                      ])
                    }
                  ]
                },
                htmlParagraph(
                  '存储内容高亮与 Obsidian 插件 <a href="https://github.com/trevware/obsidian-sidebar-highlights" target="_blank" rel="noopener noreferrer">Sidebar Highlights</a> 配合使用更佳。',
                  'option-support-note'
                )
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: 'Fragment Clipper',
          children: [
            {
              kind: 'card',
              title: 'Fragment Interaction Model',
              description: '设置上下文、辅助键和对话框快捷键。',
              body: [
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: '捕捉上下文',
                      description: '开启后需要继续配置上下文长度和单位。',
                      control: grid(
                        3,
                        [
                          boundSwitch({
                            bind: 'fragmentCaptureContext',
                            compact: true,
                            onChange: {
                              id: 'options:updateField',
                              args: ['fragmentClipper.captureContext'],
                              valueFrom: 'target.checked'
                            }
                          }),
                          {
                            kind: 'field',
                            label: 'contextLength',
                            control: boundInput({
                              bind: 'fragmentContextLength',
                              mono: true,
                              type: 'number',
                              onInput: {
                                id: 'options:updateField',
                                args: ['fragmentClipper.contextLength'],
                                valueFrom: 'target.value'
                              }
                            })
                          },
                          {
                            kind: 'field',
                            label: 'contextMode',
                            control: boundSelect({
                              bind: 'fragmentContextMode',
                              options: [
                                { value: 'chars', label: 'chars' },
                                { value: 'sentences', label: 'sentences' }
                              ],
                              onChange: {
                                id: 'options:updateField',
                                args: ['fragmentClipper.contextMode'],
                                valueFrom: 'target.value'
                              }
                            })
                          }
                        ],
                        'fragment-context-inline'
                      )
                    },
                    {
                      kind: 'row',
                      title: '启用辅助键触发',
                      description: '选择用于触发自动剪藏或阅读高亮的辅助键。',
                      control: stack(
                        (current) => [
                          boundSwitch({
                            bind: 'fragmentModifierEnabled',
                            compact: true,
                            onClick: {
                              id: 'modifier:setEnabled',
                              transform: (_value, current) => !current.state.fragmentModifierEnabled
                            }
                          }),
                          {
                            kind: 'chips',
                            items: fragmentModifierChipItems(current.state.modifierKeys),
                            action: { id: 'modifier:setKey' }
                          },
                          paragraph(
                            fragmentModifierStateWarning(current.state),
                            'modifier-key-warning'
                          )
                        ],
                        'switch-line modifier-key-inline'
                      )
                    },
                    {
                      kind: 'row',
                      title: '启用剪藏对话框快捷键',
                      description: '双击回车进入阅读模式，Cmd / Alt + 回车直接剪藏。',
                      control: boundSwitch({
                        bind: 'fragmentKeyboardShortcutsEnabled',
                        stateText: (current) =>
                          current.state.fragmentKeyboardShortcutsEnabled ? '已开启' : '已关闭',
                        onChange: {
                          id: 'options:updateField',
                          args: ['fragmentClipper.keyboardShortcutsEnabled'],
                          valueFrom: 'target.checked'
                        }
                      })
                    }
                  ]
                },
                grid(
                  2,
                  [
                    {
                      kind: 'miniCard',
                      title: '脚注格式示例',
                      content: htmlParagraph('这是选中的文本[^1]<br><br>[^1]: 这是我的评论', 'mono')
                    },
                    {
                      kind: 'miniCard',
                      title: '上下文高亮示例',
                      content: paragraph('前面的上下文 ==这是选中的文本== 后面的上下文', 'mono')
                    }
                  ],
                  'u-mt-block'
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
