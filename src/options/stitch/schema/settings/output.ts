import type { SchemaContext, SettingsSchema } from '../../types';
import { stack } from '../builders/primitives';
import { boundInput } from '../builders/controls';
import { sectionHelper } from '../builders/chrome';
import { buttonCell, textCell } from '../builders/table';
import { templateInput, templateTokenBlock, yamlPreviewBlock } from '../builders/output';
import type { SchemaMessageKey } from '../i18n';

function translate(
  current: Pick<SchemaContext, 't'>,
  key: SchemaMessageKey,
  fallback: string
): string {
  return current.t ? current.t(key, fallback) : fallback;
}

const schema: SettingsSchema = {
  createView(ctx) {
    const hero = ctx.appData.output.hero;
    const heroPills = hero.pills;

    return {
      id: 'output',
      kind: 'page',
      hero: {
        ...hero,
        title: translate(ctx, 'schemaOutputTitle', hero.title),
        description: translate(ctx, 'schemaOutputHeroDescription', hero.description),
        pills: [
          translate(ctx, 'schemaOutputTemplatesGroupTitle', heroPills[0] ?? 'Templates'),
          translate(ctx, 'schemaOutputDomainMappingsGroupTitle', heroPills[1] ?? 'Domain Naming'),
          translate(ctx, 'schemaOutputYamlGroupTitle', heroPills[2] ?? 'YAML Schema')
        ]
      },
      children: [
        {
          kind: 'group',
          title: (current) => translate(current, 'schemaOutputTemplatesGroupTitle', 'Templates'),
          children: [
            {
              kind: 'card',
              title: (current) => translate(current, 'templateConfigTitle', 'Path Templates'),
              description: (current) =>
                translate(current, 'templateConfigHint', '配置不同内容类型的保存路径。'),
              body: [
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: (current) =>
                        translate(current, 'articleTemplateLabel', '文章 / 视频路径模板'),
                      description: (current) =>
                        translate(
                          current,
                          'articleTemplateHint',
                          'article 与 video 当前共用一个路径模板。'
                        ),
                      control: templateInput('articleVideo')
                    },
                    {
                      kind: 'row',
                      title: (current) =>
                        translate(current, 'fragmentTemplateLabel', '片段路径模板'),
                      description: (current) =>
                        translate(current, 'fragmentTemplateHint', 'Fragment clipper 的落盘路径。'),
                      control: templateInput('fragment')
                    },
                    {
                      kind: 'row',
                      title: (current) =>
                        translate(current, 'readingTemplateLabel', '阅读模式路径模板'),
                      description: (current) =>
                        translate(
                          current,
                          'readingTemplateHint',
                          '可以继承文章路径、片段路径，或切换到自定义模板。'
                        ),
                      control: stack(
                        [
                          {
                            kind: 'select',
                            className: 'reading-mode-select',
                            bind: 'readingPathMode',
                            options: (current) => [
                              {
                                value: 'article',
                                label: translate(
                                  current,
                                  'readingTemplateOptionArticle',
                                  '与文章路径相同'
                                )
                              },
                              {
                                value: 'fragment',
                                label: translate(
                                  current,
                                  'readingTemplateOptionFragment',
                                  '与片段路径相同'
                                )
                              },
                              {
                                value: 'custom',
                                label: translate(current, 'readingTemplateOptionCustom', '自定义')
                              }
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
                      title: (current) => translate(current, 'aiTemplateLabel', 'AI 对话路径模板'),
                      description: (current) =>
                        translate(
                          current,
                          'aiTemplateHint',
                          'AI 导出单独保存，避免混入普通文章目录。'
                        ),
                      control: templateInput('aiChat')
                    }
                  ]
                },
                templateTokenBlock((current) =>
                  translate(
                    current,
                    'schemaOutputTemplateHelperText',
                    '将鼠标放到上方任一路径输入框，再点击下方字段快速插入。'
                  )
                )
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: (current) =>
            translate(current, 'schemaOutputDomainMappingsGroupTitle', 'Domain Naming'),
          children: [
            {
              kind: 'card',
              title: (current) => translate(current, 'domainMappingTitle', 'Domain Mappings'),
              description: (current) =>
                translate(current, 'domainMappingHint', '将域名映射为更易读的目录名。'),
              actions: [
                {
                  kind: 'button',
                  label: (current) =>
                    translate(current, 'schemaOutputAddMappingButton', '添加映射'),
                  variant: 'primary',
                  action: { id: 'domain:add' }
                }
              ],
              body: [
                {
                  kind: 'table',
                  rowClassName: 'domain-mapping-table-scroll',
                  columns: (current) => [
                    translate(current, 'schemaOutputDomainColumnLabel', 'Domain'),
                    translate(current, 'schemaOutputFolderAliasColumnLabel', 'Folder Alias'),
                    translate(current, 'schemaOutputDomainNotesColumnLabel', 'Notes'),
                    translate(current, 'yamlFieldActionsLabel', 'Actions')
                  ],
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
                            placeholder: (renderCtx) =>
                              translate(
                                renderCtx,
                                'domainMappingDomainPlaceholder',
                                'e.g., medium.com'
                              ),
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
                            placeholder: (renderCtx) =>
                              translate(renderCtx, 'domainMappingNamePlaceholder', 'e.g., Medium'),
                            onInput: {
                              id: 'domain:update',
                              args: [index, 'alias'],
                              valueFrom: 'target.value'
                            }
                          })
                        },
                        textCell(notes),
                        buttonCell(
                          (renderCtx) => translate(renderCtx, 'domainMappingDeleteButton', '删除'),
                          'ghost',
                          { id: 'domain:remove', args: [index] }
                        )
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
          title: (current) => translate(current, 'schemaOutputYamlGroupTitle', 'YAML Schema'),
          children: [
            {
              kind: 'card',
              title: (current) => translate(current, 'yamlConfigTitle', 'YAML Configuration'),
              description: (current) =>
                translate(
                  current,
                  'yamlConfigHint',
                  '按当前导出配置方式管理字段、域名覆盖和自定义字段。'
                ),
              actions: [
                {
                  kind: 'badge',
                  label: (current) =>
                    `${translate(current, 'schemaYamlFilterArticleLabel', 'Article')}: 8`,
                  variant: 'success'
                },
                {
                  kind: 'badge',
                  label: (current) =>
                    `${translate(current, 'schemaYamlFilterClipperLabel', 'Clipper')}: 7`,
                  variant: 'success'
                },
                {
                  kind: 'badge',
                  label: (current) =>
                    `${translate(current, 'schemaYamlFilterVideoLabel', 'Video')}: 9`,
                  variant: 'success'
                },
                {
                  kind: 'badge',
                  label: (current) =>
                    `${translate(current, 'schemaYamlFilterAiChatLabel', 'AI Chat')}: 7`,
                  variant: 'success'
                }
              ],
              body: [
                {
                  kind: 'widget',
                  widgetType: 'yaml-config',
                  props: { optionsKey: 'draft' }
                },
                sectionHelper(
                  (current) =>
                    translate(
                      current,
                      'schemaOutputYamlHelperText',
                      'Use the structured editor above as the single writer for fields, content type switches, custom fields, and domain overrides.'
                    ),
                  'yaml-helper'
                ),
                yamlPreviewBlock((current) =>
                  translate(current, 'schemaOutputYamlPreviewSummaryLabel', 'Preview')
                )
              ]
            }
          ]
        }
        /*
         * Zendio 0.2.0: hide Output Presets from Options.
         * These actions overwrite templates, domain mappings, and YAML config without
         * a product-approved flow, confirmation, or undo affordance.
         */
      ]
    };
  }
};

export default schema;
