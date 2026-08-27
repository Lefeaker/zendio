import { describe, expect, it } from 'vitest';
import * as storageFeedbackExports from '@options/app/productionStitchStorageFeedback';
import * as stateCoreExports from '@options/app/rest-settings/restSectionStateCore';

describe('REST settings current owners', () => {
  it('exports Stitch connection feedback and state-core helpers from current owners', () => {
    expect(Object.keys(storageFeedbackExports).sort()).toEqual([
      'createProductionStitchStorageFeedback'
    ]);

    expect(Object.keys(stateCoreExports).sort()).toEqual([
      'applyRestBaseSectionSnapshot',
      'collectAdditionalVaultConfigsCore',
      'collectRestBaseChanges',
      'collectRestBaseDraft',
      'readRestRowValue',
      'resolveDefaultVault'
    ]);
  });
});
