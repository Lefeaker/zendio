import type { SchemaContext, SettingsSchema } from '../../types';
import { stack } from '../builders/primitives';
import { boundInput } from '../builders/controls';
import { sectionHelper } from '../builders/chrome';
import { buttonCell, textCell } from '../builders/table';
import { templateInput, templateTokenBlock } from '../builders/output';
import { getDefaultProductionEnglishMessage, type SchemaMessageKey } from '../i18n';

function translate(current: Pick<SchemaContext, 't'>, key: SchemaMessageKey): string {
  const fallback = getDefaultProductionEnglishMessage(key);
  return current.t ? current.t(key, fallback) : fallback;
}

const schema: SettingsSchema = {
  createView(ctx) {
    const hero = ctx.appData.output.hero;

    return {
      id: 'output',
      kind: 'page',
      hero: {
        ...hero,
        title: translate(ctx, 'schemaOutputTitle'),
        description: translate(ctx, 'schemaOutputHeroDescription'),
        pills: [
          translate(ctx, 'schemaOutputTemplatesGroupTitle'),
          translate(ctx, 'schemaOutputDomainMappingsGroupTitle'),
          translate(ctx, 'schemaOutputYamlGroupTitle')
        ]
      },
      children: [
        {
          kind: 'group',
          title: (current) => translate(current, 'schemaOutputTemplatesGroupTitle'),
          children: [
            {
              kind: 'card',
              title: (current) => translate(current, 'templateConfigTitle'),
              description: (current) => translate(current, 'templateConfigHint'),
              body: [
                {
                  kind: 'rows',
                  items: [
                    {
                      kind: 'row',
                      title: (current) => translate(current, 'articleTemplateLabel'),
                      description: (current) => translate(current, 'articleTemplateHint'),
                      control: templateInput('articleVideo')
                    },
                    {
                      kind: 'row',
                      title: (current) => translate(current, 'videoTemplateLabel'),
                      description: (current) => translate(current, 'videoTemplateHint'),
                      control: templateInput('video')
                    },
                    {
                      kind: 'row',
                      title: (current) => translate(current, 'fragmentTemplateLabel'),
                      description: (current) => translate(current, 'fragmentTemplateHint'),
                      control: templateInput('fragment')
                    },
                    {
                      kind: 'row',
                      title: (current) => translate(current, 'readingTemplateLabel'),
                      description: (current) => translate(current, 'readingTemplateHint'),
                      control: stack(
                        [
                          {
                            kind: 'select',
                            className: 'reading-mode-select',
                            bind: 'readingPathMode',
                            options: (current) => [
                              {
                                value: 'article',
                                label: translate(current, 'readingTemplateOptionArticle')
                              },
                              {
                                value: 'fragment',
                                label: translate(current, 'readingTemplateOptionFragment')
                              },
                              {
                                value: 'custom',
                                label: translate(current, 'readingTemplateOptionCustom')
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
                      title: (current) => translate(current, 'aiTemplateLabel'),
                      description: (current) => translate(current, 'aiTemplateHint'),
                      control: templateInput('aiChat')
                    }
                  ]
                },
                templateTokenBlock((current) =>
                  translate(current, 'schemaOutputTemplateHelperText')
                )
              ]
            }
          ]
        },
        {
          kind: 'group',
          title: (current) => translate(current, 'schemaOutputDomainMappingsGroupTitle'),
          children: [
            {
              kind: 'card',
              title: (current) => translate(current, 'domainMappingTitle'),
              description: (current) => translate(current, 'domainMappingHint'),
              actions: [
                {
                  kind: 'button',
                  label: (current) => translate(current, 'schemaOutputAddMappingButton'),
                  variant: 'primary',
                  action: { id: 'domain:add' }
                }
              ],
              body: [
                {
                  kind: 'table',
                  rowClassName: 'domain-mapping-table-scroll',
                  columns: (current) => [
                    translate(current, 'schemaOutputDomainColumnLabel'),
                    translate(current, 'schemaOutputFolderAliasColumnLabel'),
                    translate(current, 'schemaOutputDomainNotesColumnLabel'),
                    translate(current, 'yamlFieldActionsLabel')
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
                              translate(renderCtx, 'domainMappingDomainPlaceholder'),
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
                              translate(renderCtx, 'domainMappingNamePlaceholder'),
                            onInput: {
                              id: 'domain:update',
                              args: [index, 'alias'],
                              valueFrom: 'target.value'
                            }
                          })
                        },
                        textCell(notes),
                        buttonCell(
                          (renderCtx) => translate(renderCtx, 'domainMappingDeleteButton'),
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
          title: (current) => translate(current, 'schemaOutputYamlGroupTitle'),
          children: [
            {
              kind: 'card',
              title: (current) => translate(current, 'yamlConfigTitle'),
              description: (current) => translate(current, 'yamlConfigHint'),
              actions: [
                {
                  kind: 'badge',
                  label: (current) => `${translate(current, 'schemaYamlFilterArticleLabel')}: 8`,
                  variant: 'success'
                },
                {
                  kind: 'badge',
                  label: (current) => `${translate(current, 'schemaYamlFilterClipperLabel')}: 7`,
                  variant: 'success'
                },
                {
                  kind: 'badge',
                  label: (current) => `${translate(current, 'schemaYamlFilterVideoLabel')}: 9`,
                  variant: 'success'
                },
                {
                  kind: 'badge',
                  label: (current) => `${translate(current, 'schemaYamlFilterAiChatLabel')}: 7`,
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
                  (current) => translate(current, 'schemaOutputYamlHelperText'),
                  'yaml-helper'
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
