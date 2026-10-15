import type { StoredOptions } from '../../src/shared/types/options';

// Synthetic values only. Each free-text category has a distinct marker so that
// a report cannot pass by masking just API key properties.
export const DIAGNOSTICS_PRIVATE_VALUES = [
  'PRIVATE_REST_KEY',
  'PRIVATE_CLASSIFIER_KEY',
  'PRIVATE_AI_KEY',
  'PRIVATE_VAULT_KEY',
  'PRIVATE_DISABLED_KEY',
  'PRIVATE_ENDPOINT_USER',
  'PRIVATE_ENDPOINT_PASSWORD',
  'PRIVATE_ENDPOINT_HOST',
  'PRIVATE_ENDPOINT_PATH',
  'PRIVATE_ENDPOINT_QUERY',
  'PRIVATE_USER_NAME',
  'PRIVATE_VAULT_NAME',
  'PRIVATE_VAULT_ID',
  'PRIVATE_FOLDER_PATH',
  'PRIVATE_DOMAIN_NAME',
  'PRIVATE_DOMAIN_ALIAS',
  'PRIVATE_YAML_NAME',
  'PRIVATE_YAML_VALUE',
  'PRIVATE_MODEL_NAME'
];

export function createDiagnosticsPrivacyOptions(): StoredOptions {
  const endpoint =
    'https://PRIVATE_ENDPOINT_USER:PRIVATE_ENDPOINT_PASSWORD@PRIVATE_ENDPOINT_HOST:27124/PRIVATE_ENDPOINT_PATH?token=PRIVATE_ENDPOINT_QUERY';
  return {
    rest: {
      httpsUrl: endpoint,
      httpUrl: '',
      apiKey: 'PRIVATE_REST_KEY',
      vault: 'PRIVATE_VAULT_NAME'
    },
    templates: {
      article: 'PRIVATE_FOLDER_PATH/{title}.md',
      fragment: 'PRIVATE_FOLDER_PATH/{title}.md',
      ai: 'PRIVATE_FOLDER_PATH/{title}.md',
      video: ''
    },
    classifier: {
      enabled: true,
      provider: 'compatible',
      endpoint,
      apiKey: 'PRIVATE_CLASSIFIER_KEY',
      model: 'PRIVATE_MODEL_NAME'
    },
    experimentalAi: { apiUrl: endpoint, apiKey: 'PRIVATE_AI_KEY', model: 'PRIVATE_MODEL_NAME' },
    aiChat: { userName: 'PRIVATE_USER_NAME', includeTimestamps: true },
    domainMappings: { PRIVATE_DOMAIN_NAME: 'PRIVATE_DOMAIN_ALIAS' },
    vaultRouter: {
      defaultVaultId: 'default',
      vaults: [
        {
          id: 'default',
          name: 'PRIVATE_VAULT_NAME',
          vault: 'PRIVATE_VAULT_NAME',
          httpsUrl: endpoint,
          httpUrl: '',
          apiKey: 'PRIVATE_REST_KEY',
          isDefault: true,
          enabled: true
        },
        {
          id: 'PRIVATE_VAULT_ID',
          name: 'PRIVATE_VAULT_NAME',
          vault: 'PRIVATE_VAULT_NAME',
          httpsUrl: endpoint,
          httpUrl: '',
          apiKey: 'PRIVATE_VAULT_KEY',
          enabled: true
        },
        {
          id: 'disabled',
          name: 'PRIVATE_VAULT_NAME',
          vault: 'PRIVATE_VAULT_NAME',
          httpsUrl: endpoint,
          httpUrl: '',
          apiKey: 'PRIVATE_DISABLED_KEY',
          enabled: false
        }
      ],
      rules: [
        {
          id: 'rule',
          vaultId: 'PRIVATE_VAULT_ID',
          type: 'domain',
          pattern: 'PRIVATE_DOMAIN_NAME',
          enabled: true,
          priority: 1
        }
      ]
    },
    yamlConfig: {
      globalFields: [
        {
          name: 'PRIVATE_YAML_NAME',
          type: 'text',
          enabled: true,
          defaultValue: 'PRIVATE_YAML_VALUE'
        }
      ]
    },
    readingSession: { exportMode: 'full', highlightTheme: 'purple' },
    fragmentClipper: {
      captureContext: true,
      contextLength: 120,
      selectionTriggerMode: 'modifier',
      selectionModifierKeys: ['shift']
    }
  };
}
