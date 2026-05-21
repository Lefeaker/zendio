import { describe, it } from 'vitest';
import {
  createSchemaContext,
  expectProductionText,
  expectSettingsSchemas
} from '../../utils/productionStitchAssertions';
import { getSettingsView } from '@options/stitch/schema/registry';

describe('production hotspot coverage', () => {
  it('keeps production Stitch schemas as the Options UI surface under budget review', () => {
    expectSettingsSchemas(
      'overview',
      'storage',
      'capture-sources',
      'capture-behavior',
      'output',
      'maintenance'
    );
    expect(getSettingsView('maintenance', createSchemaContext())).toBeTruthy();
    expectProductionText('Overview', 'Storage', 'Maintenance');
  });
});
