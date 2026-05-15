import { describe, it } from 'vitest';
import { mergeOptions } from '@shared/config/optionsMerger';
import type { CompleteOptions } from '@shared/types/options';
import { previewContent } from '@options/stitch/content';
import { createProductionContent } from '@options/app/productionStitchStateMapper';
import {
  createSchemaContext,
  expectProductionText,
  expectSettingsSchemas
} from '../../../utils/productionStitchAssertions';
import { getSettingsView } from '@options/stitch/schema/registry';

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
    expectProductionText('Vault List', 'Advanced Connection', 'Routing Engine');
  });

  it('maps REST storage options into production Stitch vault content', () => {
    const options = mergeOptions({
      rest: {
        vault: 'Research',
        baseUrl: 'https://localhost:27124',
        httpsUrl: 'https://127.0.0.1:27124/',
        httpUrl: 'http://127.0.0.1:27123/',
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
        https: 'https://127.0.0.1:27124/',
        http: 'http://127.0.0.1:27123/',
        key: 'secret',
        enabled: true,
        isDefault: true
      })
    );
  });
});
