import type { SchemaContext, SettingsSchema } from '../../types';
import { stack } from '../builders/primitives';
import { boundInput } from '../builders/controls';
import { sectionHelper } from '../builders/chrome';
import { buttonCell, textCell } from '../builders/table';
import { templateInput, templateTokenBlock, yamlPreviewBlock } from '../builders/output';
import { DEFAULT_PRODUCTION_ENGLISH_MESSAGES, type SchemaMessageKey } from '../i18n';

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
                translate(
                  current,
                  'templateConfigHint',
                  DEFAULT_PRODUCTION_ENGLISH_MESSAGES.templateConfigHint
                ),
              body: [
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: (current) =>
                        translate(
                          current,
                          'articleTemplateLabel',
                          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.articleTemplateLabel
                        ),
                      description: (current) =>
                        translate(
                          current,
                          'articleTemplateHint',
                          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.articleTemplateHint
                        ),
                      control: templateInput('articleVideo')
                    },
                    {
                      kind: 'row',
                      title: (current) =>
                        translate(
                          current,
                          'fragmentTemplateLabel',
                          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.fragmentTemplateLabel
                        ),
                      description: (current) =>
                        translate(
                          current,
                          'fragmentTemplateHint',
                          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.fragmentTemplateHint
                        ),
                      control: templateInput('fragment')
                    },
                    {
                      kind: 'row',
                      title: (current) =>
                        translate(
                          current,
                          'readingTemplateLabel',
                          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.readingTemplateLabel
                        ),
                      description: (current) =>
                        translate(
                          current,
                          'readingTemplateHint',
                          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.readingTemplateHint
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
                                  DEFAULT_PRODUCTION_ENGLISH_MESSAGES.readingTemplateOptionArticle
                                )
                              },
                              {
                                value: 'fragment',
                                label: translate(
                                  current,
                                  'readingTemplateOptionFragment',
                                  DEFAULT_PRODUCTION_ENGLISH_MESSAGES.readingTemplateOptionFragment
                                )
                              },
                              {
                                value: 'custom',
                                label: translate(
                                  current,
                                  'readingTemplateOptionCustom',
                                  DEFAULT_PRODUCTION_ENGLISH_MESSAGES.readingTemplateOptionCustom
                                )
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
                      title: (current) =>
                        translate(
                          current,
                          'aiTemplateLabel',
                          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.aiTemplateLabel
                        ),
                      description: (current) =>
                        translate(
                          current,
                          'aiTemplateHint',
                          DEFAULT_PRODUCTION_ENGLISH_MESSAGES.aiTemplateHint
                        ),
                      control: templateInput('aiChat')
                    }
                  ]
                },
                templateTokenBlock((current) =>
                  translate(
                    current,
                    'schemaOutputTemplateHelperText',
                    DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaOutputTemplateHelperText
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
                translate(
                  current,
                  'domainMappingHint',
                  DEFAULT_PRODUCTION_ENGLISH_MESSAGES.domainMappingHint
                ),
              actions: [
                {
                  kind: 'button',
                  label: (current) =>
                    translate(
                      current,
                      'schemaOutputAddMappingButton',
                      DEFAULT_PRODUCTION_ENGLISH_MESSAGES.schemaOutputAddMappingButton
                    ),
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
                          (renderCtx) =>
                            translate(
                              renderCtx,
                              'domainMappingDeleteButton',
                              DEFAULT_PRODUCTION_ENGLISH_MESSAGES.domainMappingDeleteButton
                            ),
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
                  DEFAULT_PRODUCTION_ENGLISH_MESSAGES.yamlConfigHint
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
