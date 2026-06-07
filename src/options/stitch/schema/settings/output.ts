import type { SettingsSchema } from '../../types';
import { stack } from '../builders/primitives';
import { boundInput } from '../builders/controls';
import { sectionHelper } from '../builders/chrome';
import { buttonCell, textCell } from '../builders/table';
import { templateInput, templateTokenBlock, yamlPreviewBlock } from '../builders/output';

const schema: SettingsSchema = {
  createView(ctx) {
    return {
      id: 'output',
      kind: 'page',
      hero: ctx.appData.output.hero,
      children: [
        {
          kind: 'group',
          title: 'Templates',
          children: [
            {
              kind: 'card',
              title: 'Path Templates',
              description: '配置不同内容类型的保存路径。',
              body: [
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: '文章 / 视频路径模板',
                      description: 'article 与 video 当前共用一个路径模板。',
                      control: templateInput('articleVideo')
                    },
                    {
                      kind: 'row',
                      title: '片段路径模板',
                      description: 'Fragment clipper 的落盘路径。',
                      control: templateInput('fragment')
                    },
                    {
                      kind: 'row',
                      title: '阅读模式路径模板',
                      description: '可以继承文章路径、片段路径，或切换到自定义模板。',
                      control: stack(
                        [
                          {
                            kind: 'select',
                            className: 'reading-mode-select',
                            bind: 'readingPathMode',
                            options: [
                              { value: 'article', label: '与文章路径相同' },
                              { value: 'fragment', label: '与片段路径相同' },
                              { value: 'custom', label: '自定义' }
                            ],
                            onChange: { id: 'output:setReadingPathMode', valueFrom: 'target.value' }
                          },
                          (current) =>
                            current.state.readingPathMode === 'custom'
                              ? templateInput('readingCustom')
                              : null
                        ],
                        'reading-template-row'
                      )
                    },
                    {
                      kind: 'row',
                      title: 'AI 对话路径模板',
                      description: 'AI 导出单独保存，避免混入普通文章目录。',
                      control: templateInput('aiChat')
                    }
                  ]
                },
                templateTokenBlock()
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: 'Domain Naming',
          children: [
            {
              kind: 'card',
              title: 'Domain Mappings',
              description: '将域名映射为更易读的目录名。',
              actions: [
                {
                  kind: 'button',
                  label: '添加映射',
                  variant: 'primary',
                  action: { id: 'domain:add' }
                }
              ],
              body: [
                {
                  kind: 'table',
                  rowClassName: 'domain-mapping-table-scroll',
                  columns: ['Domain', 'Folder Alias', 'Notes', 'Actions'],
                  rows: (current) => {
                    const mappings = current.appData.output.domainMappings.length
                      ? current.appData.output.domainMappings
                      : ([['', '', '']] as Array<[string, string, string]>);
                    return mappings.map(([domain, alias, notes], index) => ({
                      cells: [
                        {
                          node: boundInput({
                            value: domain,
                            mono: true,
                            onInput: {
                              id: 'domain:update',
                              args: [index, 'domain'],
                              valueFrom: 'target.value'
                            }
                          })
                        },
                        {
                          node: boundInput({
                            value: alias,
                            onInput: {
                              id: 'domain:update',
                              args: [index, 'alias'],
                              valueFrom: 'target.value'
                            }
                          })
                        },
                        textCell(notes),
                        buttonCell('删除', 'ghost', { id: 'domain:remove', args: [index] })
                      ]
                    }));
                  }
                }
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: 'YAML Schema',
          children: [
            {
              kind: 'card',
              title: 'YAML Configuration',
              description: '按当前导出配置方式管理字段、域名覆盖和自定义字段。',
              actions: [
                { kind: 'badge', label: 'Article: 8', variant: 'success' },
                { kind: 'badge', label: 'Clipper: 7', variant: 'success' },
                { kind: 'badge', label: 'Video: 9', variant: 'success' },
                { kind: 'badge', label: 'AI Chat: 7', variant: 'success' }
              ],
              body: [
                {
                  kind: 'widget',
                  widgetType: 'yaml-config',
                  props: { optionsKey: 'draft' }
                },
                sectionHelper(
                  'Use the structured editor above as the single writer for fields, content type switches, custom fields, and domain overrides.',
                  'yaml-helper'
                ),
                yamlPreviewBlock()
              ]
            }
          ]
        }
        // Presets remain wired in the production action layer, but the production Options UI
        // intentionally hides this frontend section for now.
        // {
        //   kind: 'group',
        //   title: 'Presets',
        //   children: [
        //     {
        //       kind: 'card',
        //       title: 'Output Presets',
        //       description:
        //         'Presets 不只切换样式，而应同时作用于模板、YAML 字段集和 domain overrides。',
        //       body: [
        //         grid(3, (current) =>
        //           current.appData.output.presets.map(([title, description]) => ({
        //             kind: 'miniCard',
        //             title,
        //             content: [
        //               element('p', { text: description }),
        //               {
        //                 kind: 'button',
        //                 label: `Apply ${title}`,
        //                 variant: 'secondary',
        //                 action: { id: 'output:applyPreset', args: [title] }
        //               }
        //             ]
        //           }))
        //         )
        //       ]
        //     }
        //   ]
        // }
      ]
    };
  }
};

export default schema;
