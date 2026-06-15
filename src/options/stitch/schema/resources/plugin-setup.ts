import type { ResourceSchema } from '../../types';
import { code } from '../builders/primitives';
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
        ? (ctx.t?.('schemaResourcePluginSetupTitle', 'Plugin Setup') ?? 'Plugin Setup')
        : 'Plugin Setup',
      description: shouldLocalize
        ? (ctx.t?.(
            'schemaResourcePluginSetupDescription',
            'Configure Obsidian Local REST API before editing advanced storage rules.'
          ) ?? 'Configure Obsidian Local REST API before editing advanced storage rules.')
        : 'Configure Obsidian Local REST API before editing advanced storage rules.',
      size: 'large',
      children: [
        resourceModalStack([
          heroPills(
            shouldLocalize
              ? [
                  ctx.t?.('apiConfigTitle', 'Obsidian Local REST API') ?? 'Obsidian Local REST API',
                  ctx.t?.('schemaResourcePluginSetupFieldHttpsUrl', 'HTTPS URL') ?? 'HTTPS URL',
                  ctx.t?.('schemaResourcePluginSetupFieldVault', 'Vault') ?? 'Vault',
                  ctx.t?.('testConnectionButton_short', 'Test') ?? 'Test'
                ]
              : guide.hero.pills
          ),
          modalSection(
            ctx.t?.('schemaResourcePluginSetupRecommendedValuesGroupTitle', 'Recommended Values') ??
              'Recommended Values',
            [
              {
                kind: 'table',
                columns: ['Field', 'Value'],
                rows: (shouldLocalize
                  ? [
                      [
                        ctx.t?.('schemaResourcePluginSetupFieldHttpsUrl', 'HTTPS URL') ??
                          'HTTPS URL',
                        fieldValues.https
                      ],
                      [
                        ctx.t?.('schemaResourcePluginSetupFieldHttpUrl', 'HTTP URL') ?? 'HTTP URL',
                        fieldValues.http
                      ],
                      [
                        ctx.t?.('schemaResourcePluginSetupFieldVault', 'Vault') ?? 'Vault',
                        fieldValues.vault
                      ],
                      [
                        ctx.t?.('schemaResourcePluginSetupFieldApiKey', 'API Key') ?? 'API Key',
                        fieldValues.apiKey
                      ]
                    ]
                  : guide.ports
                ).map(([label, value]) => ({
                  cells: [{ text: label }, { node: code(value) }]
                }))
              }
            ]
          ),
          modalSectionRaw([
            modalSectionHead(
              ctx.t?.('schemaResourcePluginSetupSetupFlowGroupTitle', 'Setup Flow') ?? 'Setup Flow',
              {
                kind: 'button',
                label: shouldLocalize
                  ? (ctx.t?.('schemaResourcePluginSetupGoToStorageButton', 'Go To Storage') ??
                    'Go To Storage')
                  : 'Go To Storage',
                variant: 'primary',
                action: { id: 'navigation:closeResourceAndScrollToPanel', args: ['storage'] }
              }
            ),
            stepGrid(
              shouldLocalize
                ? [
                    ctx.t?.(
                      'schemaResourcePluginSetupStep1',
                      'Install and enable Obsidian Local REST API in Community Plugins.'
                    ) ?? 'Install and enable Obsidian Local REST API in Community Plugins.',
                    ctx.t?.(
                      'schemaResourcePluginSetupStep2',
                      'Open the plugin settings and confirm both HTTPS and HTTP endpoints.'
                    ) ?? 'Open the plugin settings and confirm both HTTPS and HTTP endpoints.',
                    ctx.t?.(
                      'schemaResourcePluginSetupStep3',
                      'Copy the vault name and API key from Obsidian.'
                    ) ?? 'Copy the vault name and API key from Obsidian.',
                    ctx.t?.(
                      'schemaResourcePluginSetupStep4',
                      'Return to Storage and fill the default vault row first.'
                    ) ?? 'Return to Storage and fill the default vault row first.',
                    ctx.t?.(
                      'schemaResourcePluginSetupStep5',
                      'Run the connection test before saving more routing rules.'
                    ) ?? 'Run the connection test before saving more routing rules.'
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
          modalSection(
            ctx.t?.('schemaResourcePluginSetupChecklistGroupTitle', 'Checklist') ?? 'Checklist',
            [
              {
                kind: 'list',
                items: shouldLocalize
                  ? [
                      ctx.t?.(
                        'schemaResourcePluginSetupChecklist1',
                        'Obsidian is running and Local REST API is enabled.'
                      ) ?? 'Obsidian is running and Local REST API is enabled.',
                      ctx.t?.(
                        'schemaResourcePluginSetupChecklist2',
                        'HTTPS and HTTP endpoints match the plugin settings.'
                      ) ?? 'HTTPS and HTTP endpoints match the plugin settings.',
                      ctx.t?.(
                        'schemaResourcePluginSetupChecklist3',
                        'Vault name spelling is exact.'
                      ) ?? 'Vault name spelling is exact.',
                      ctx.t?.(
                        'schemaResourcePluginSetupChecklist4',
                        'API key was copied without extra spaces.'
                      ) ?? 'API key was copied without extra spaces.',
                      ctx.t?.(
                        'schemaResourcePluginSetupChecklist5',
                        'The Storage connection test returns success.'
                      ) ?? 'The Storage connection test returns success.'
                    ]
                  : guide.checks
              }
            ]
          )
        ])
      ]
    };
  }
};

export default schema;
