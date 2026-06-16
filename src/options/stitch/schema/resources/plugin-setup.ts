import type { ResourceSchema } from '../../types';
import { code } from '../builders/primitives';
import { translateSchemaMessage, type SchemaMessageKey } from '../i18n';
import {
  heroPills,
  modalSection,
  modalSectionHead,
  modalSectionRaw,
  resourceModalStack,
  stepCard,
  stepGrid
} from '../builders/resources';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const guide = ctx.appData.resources.pluginSetup;
    const shouldLocalize = Boolean(ctx.messages);
    const tr = (key: SchemaMessageKey) => translateSchemaMessage(ctx.t, key);
    const fieldValues = {
      https: guide.ports.find(([label]) => label.toLowerCase().includes('https'))?.[1] ?? '',
      http: guide.ports.find(([label]) => label.toLowerCase().includes('http'))?.[1] ?? '',
      vault: guide.ports.find(([label]) => label.toLowerCase().includes('vault'))?.[1] ?? '',
      apiKey: guide.ports.find(([label]) => label.toLowerCase().includes('api'))?.[1] ?? ''
    };
    return {
      id: 'plugin-setup',
      kind: 'modal',
      title: shouldLocalize
        ? tr('schemaResourcePluginSetupTitle')
        : tr('schemaResourcePluginSetupTitle'),
      description: shouldLocalize
        ? tr('schemaResourcePluginSetupDescription')
        : tr('schemaResourcePluginSetupDescription'),
      size: 'large',
      children: [
        resourceModalStack([
          heroPills(
            shouldLocalize
              ? [
                  tr('apiConfigTitle'),
                  tr('schemaResourcePluginSetupFieldHttpsUrl'),
                  tr('schemaResourcePluginSetupFieldVault'),
                  tr('testConnectionButton_short')
                ]
              : guide.hero.pills
          ),
          modalSection(tr('schemaResourcePluginSetupRecommendedValuesGroupTitle'), [
            {
              kind: 'table',
              columns: [tr('schemaCommonFieldColumnLabel'), tr('schemaCommonValueColumnLabel')],
              rows: (shouldLocalize
                ? [
                    [tr('schemaResourcePluginSetupFieldHttpsUrl'), fieldValues.https],
                    [tr('schemaResourcePluginSetupFieldHttpUrl'), fieldValues.http],
                    [tr('schemaResourcePluginSetupFieldVault'), fieldValues.vault],
                    [tr('schemaResourcePluginSetupFieldApiKey'), fieldValues.apiKey]
                  ]
                : guide.ports
              ).map(([label, value]) => ({
                cells: [{ text: label }, { node: code(value) }]
              }))
            }
          ]),
          modalSectionRaw([
            modalSectionHead(tr('schemaResourcePluginSetupSetupFlowGroupTitle'), {
              kind: 'button',
              label: tr('schemaResourcePluginSetupGoToStorageButton'),
              variant: 'primary',
              action: { id: 'navigation:closeResourceAndScrollToPanel', args: ['storage'] }
            }),
            stepGrid(
              shouldLocalize
                ? [
                    tr('schemaResourcePluginSetupStep1'),
                    tr('schemaResourcePluginSetupStep2'),
                    tr('schemaResourcePluginSetupStep3'),
                    tr('schemaResourcePluginSetupStep4'),
                    tr('schemaResourcePluginSetupStep5')
                  ].map((step, index) =>
                    stepCard({
                      number: String(index + 1),
                      title: step,
                      description: ''
                    })
                  )
                : guide.steps.map((step, index) =>
                    stepCard({
                      number: String(index + 1),
                      title: step.title,
                      description: step.body
                    })
                  ),
              true
            )
          ]),
          modalSection(tr('schemaResourcePluginSetupChecklistGroupTitle'), [
            {
              kind: 'list',
              items: shouldLocalize
                ? [
                    tr('schemaResourcePluginSetupChecklist1'),
                    tr('schemaResourcePluginSetupChecklist2'),
                    tr('schemaResourcePluginSetupChecklist3'),
                    tr('schemaResourcePluginSetupChecklist4'),
                    tr('schemaResourcePluginSetupChecklist5')
                  ]
                : guide.checks
            }
          ])
        ])
      ]
    };
  }
};

export default schema;
