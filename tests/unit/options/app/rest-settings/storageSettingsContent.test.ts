import { describe, expect, it } from 'vitest';
import { DEFAULT_RUNTIME_MESSAGES } from '@i18n';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { CompleteOptions } from '@shared/types/options';
import { previewContent } from '@options/stitch/content';
import { createProductionContent } from '@options/app/productionStitchStateMapper';
import { createSchemaTranslator } from '@options/stitch/schema/i18n';
import {
  createSchemaContext,
  expectProductionText,
  expectSettingsSchemas
} from '../../../../utils/productionStitchAssertions';
import { getSettingsView } from '@options/stitch/schema/registry';
import { getRestDefaults } from '../../../../utils/restDefaults';

const REST_DEFAULTS = getRestDefaults();
const LOCALHOST_BASE_URL = `https://localhost:${REST_DEFAULTS.httpsPort}`;
const STORAGE_SENTINEL_MESSAGES = {
  ...DEFAULT_RUNTIME_MESSAGES,
  schemaStorageRoutingTipBody: 'Schema Routing Tip Body Sentinel',
  schemaStorageRoutingTipTitle: 'Schema Routing Tip Title Sentinel',
  schemaStorageTestConnectionButton: 'Schema Test Connection Sentinel',
  schemaStorageVaultListTitle: 'Schema Vault List Sentinel',
  schemaStorageVaultsGroupTitle: 'Schema Vault Group Sentinel'
};

describe('storage settings', () => {
  it('is represented by production Stitch content and schemas', () => {
    expectSettingsSchemas(
      'overview',
      'storage',
      'capture-sources',
      'capture-behavior',
      'output',
      'maintenance'
    );
    expect(getSettingsView('overview', createSchemaContext())).toBeTruthy();
    expectProductionText('Vault List', 'Routing Engine');

    const storageView = getSettingsView('storage', createSchemaContext());
    const storageViewText = JSON.stringify(storageView);
    expect(storageViewText).not.toContain('Advanced Connection Schema');
    expect(storageViewText).not.toContain('rootDir');
  });

  it('maps REST storage options into production Stitch vault content', () => {
    const options = mergeOptions({
      rest: {
        vault: 'Research',
        baseUrl: LOCALHOST_BASE_URL,
        httpsUrl: REST_DEFAULTS.httpsUrl,
        httpUrl: REST_DEFAULTS.httpUrl,
        apiKey: 'secret',
        rootDir: 'Research/'
      }
    } as Partial<CompleteOptions>) as CompleteOptions;

    const content = createProductionContent(previewContent, options);

    expect(content.storage.rootDir).toBe('Research/');
    expect(content.storage.vaults[0]).toEqual(
      expect.objectContaining({
        id: 'default',
        name: 'Research',
        https: REST_DEFAULTS.httpsUrl,
        http: REST_DEFAULTS.httpUrl,
        key: 'secret',
        enabled: true,
        isDefault: true
      })
    );
  });

  it('uses schema message overrides for storage section labels', () => {
    const context = createSchemaContext();
    const translatedContext = {
      ...context,
      messages: STORAGE_SENTINEL_MESSAGES,
      t: createSchemaTranslator(STORAGE_SENTINEL_MESSAGES)
    };

    const storageView = getSettingsView('storage', translatedContext);
    const storageViewText = JSON.stringify(storageView);

    expect(storageViewText).toContain('Schema Vault Group Sentinel');
    expect(storageViewText).toContain('Schema Vault List Sentinel');
    expect(storageViewText).toContain('Schema Test Connection Sentinel');
    expect(storageViewText).toContain('Schema Routing Tip Title Sentinel');
    expect(storageViewText).toContain('Schema Routing Tip Body Sentinel');
  });
});
