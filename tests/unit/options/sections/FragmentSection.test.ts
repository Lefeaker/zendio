import { describe, it } from 'vitest';
import {
  createSchemaContext,
  expectProductionText,
  expectSettingsSchemas
} from '../../../utils/productionStitchAssertions';
import { getSettingsView } from '@options/stitch/schema/registry';

describe('fragment capture settings', () => {
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
    expectProductionText('Fragment Clipper', 'fragment.contextLength', 'Shortcuts');
  });
});
