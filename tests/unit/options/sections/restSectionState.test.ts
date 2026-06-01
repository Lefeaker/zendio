import { describe, expect, it } from 'vitest';
import * as connectionResultExports from '@options/app/rest-settings/restSectionConnectionResult';
import * as stateCoreExports from '@options/app/rest-settings/restSectionStateCore';

describe('restSectionState compatibility test migration', () => {
  it('keeps the legacy section test path pointed at current REST app owners', () => {
    expect(Object.keys(connectionResultExports).sort()).toEqual([
      'buildRestConnectionResult',
      'renderRestConnectionTestResult',
      'resetRestConnectionTestResult'
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
