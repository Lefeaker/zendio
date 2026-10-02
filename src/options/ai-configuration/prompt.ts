import type { Messages } from '@i18n';
import type { CompleteOptions } from '@shared/types/options';
import { RoutingRuleTypeSchema } from '@shared/schemas/vault.schema';
import { YamlContentTypeSchema, YamlFieldTypeSchema } from '@shared/schemas/yamlConfig.schema';
import { readOptionsPath } from '../state/optionsPatchModel';
import { resolveExtensionVersionLabel } from '../app/productionStitchVersion';
import { AI_CONFIG_FIELDS, aiConfigFieldDictionary } from './catalog';
import { publicAiVaults } from './vaults';
import { NOTE_TEMPLATE_TOKENS } from './validation';

export function createAiConfigPrompt(
  m: Messages,
  browser: string,
  current?: CompleteOptions
): string {
  const dictionary = {
    product: 'Zendio',
    extensionVersion: resolveExtensionVersionLabel(),
    browser,
    format: 'zendio-ai-config',
    version: 1,
    fields: aiConfigFieldDictionary(m),
    collections: {
      domainMappings: { merge: 'upsert-by-key', example: { 'arxiv.org': 'Papers' } },
      'vaultRouter.vaults': {
        merge: 'upsert-by-id',
        defaultVaultAlias: '$default',
        requiredForNew: ['id', 'name', 'vault'],
        optional: {
          name: 'string',
          vault: 'string',
          httpsUrl: 'URL or empty',
          httpUrl: 'URL or empty',
          enabled: 'boolean'
        },
        example: [{ id: '$default', name: 'My Vault', vault: 'My Vault' }]
      },
      'vaultRouter.rules': {
        merge: 'upsert-by-id',
        types: RoutingRuleTypeSchema.options,
        example: [
          {
            id: 'research-websites',
            vaultId: '$default',
            type: 'domain',
            pattern: 'arxiv.org',
            enabled: true,
            priority: 20
          }
        ]
      },
      yamlConfig: {
        merge: 'upsert-fields-by-name',
        contentTypes: YamlContentTypeSchema.options,
        fieldTypes: YamlFieldTypeSchema.options,
        fieldRequired: ['name', 'type', 'enabled'],
        fieldOptional: ['defaultValue', 'required', 'description', 'isCustom', 'valuePath'],
        sections: ['fields', 'customFields', 'domainOverrides'],
        example: {
          contentTypes: {
            article: {
              customFields: [
                { name: 'project', type: 'text', enabled: true, defaultValue: 'Research' }
              ]
            }
          }
        }
      }
    },
    noteTemplateVariables: NOTE_TEMPLATE_TOKENS.map((token) => '{' + token + '}'),
    screenshotTemplateVariables: [
      '${noteFileName}',
      '${noteFilePath}',
      '${noteFolderPath}',
      '${noteFolderName}',
      '${originalAttachmentFileName}',
      '${originalAttachmentFileExtension}',
      "${date:{momentJsFormat:'YYYYMMDDHHmmssSSS'}}"
    ],
    screenshotMarkdownVariables: [
      '${generatedAttachmentFileName}',
      '${generatedAttachmentFilePath}'
    ],
    manualOnly: [
      'local-folder-permission',
      'apiKey',
      'privacy-consent',
      'language',
      'install-obsidian-plugins'
    ],
    example: {
      format: 'zendio-ai-config',
      version: 1,
      changes: {
        'fragmentClipper.selectionTriggerMode': 'modifier',
        'fragmentClipper.selectionModifierKeys': ['alt'],
        'readingSession.exportMode': 'highlights'
      }
    },
    ...(current
      ? {
          current: {
            ...Object.fromEntries(
              AI_CONFIG_FIELDS.map(({ path }) => [path.join('.'), readOptionsPath(current, path)])
            ),
            domainMappings: current.domainMappings,
            yamlConfig: current.yamlConfig ?? {},
            'vaultRouter.vaults': publicAiVaults(current),
            'vaultRouter.rules': [
              ...(current.vaultRouter?.rules ?? []),
              ...(current.vaultRouter?.vaults.flatMap((vault) => vault.rules ?? []) ?? [])
            ]
          }
        }
      : {})
  };
  return [
    m.aiConfigPromptRules,
    JSON.stringify(dictionary, null, 2),
    m.templateVariableNote,
    browser === 'firefox' ? m.settingsVaultFirefox : m.settingsVaultLocal,
    m.settingsVaultRest,
    m.schemaCaptureBehaviorSidebarHighlightsNote,
    m.schemaCaptureSourcesAttachmentGuidancePrefix +
      m.schemaCaptureSourcesAttachmentGuidanceLink +
      m.schemaCaptureSourcesAttachmentGuidanceSuffix
  ].join('\n\n');
}
