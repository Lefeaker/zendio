import type { CompleteOptions, RestOptions, StoredOptions } from '@shared/types/options';
import type { VaultConfig } from '@shared/types/vault';
import type { VaultRouterConfig } from '@shared/types';
import type { RestSectionBaseInputs } from '@options/app/rest-settings/restSectionStateCore';
import {
  applyRestBaseSectionSnapshot,
  collectAdditionalVaultConfigsCore,
  collectRestBaseChanges,
  collectRestBaseDraft
} from '@options/app/rest-settings/restSectionStateCore';
export { readRestRowValue } from '@options/app/rest-settings/restSectionStateCore';

export interface RestSectionDefaultInputs extends RestSectionBaseInputs {}

export function applyRestSectionSnapshot(params: {
  options: StoredOptions | CompleteOptions;
  defaultInputs: RestSectionDefaultInputs;
  defaultVaultId: string | null;
  vaultRouterSnapshot: VaultRouterConfig | null;
  defaults: RestOptions;
}): {
  name: string;
  httpsUrl: string;
  httpUrl: string;
  apiKey: string;
} {
  return applyRestBaseSectionSnapshot(params);
}

export function collectRestSectionChanges(params: {
  previous: StoredOptions | null;
  defaultInputs: RestSectionDefaultInputs;
  defaults: RestOptions;
}): Partial<CompleteOptions> {
  return collectRestBaseChanges(params);
}

export function collectRestDraftForTest(
  defaultInputs: RestSectionDefaultInputs
): Partial<RestOptions> {
  return collectRestBaseDraft(defaultInputs);
}

export function collectAdditionalVaultConfigsForTest(params: {
  additionalRowsHost: HTMLElement | null;
  vaultRouterSnapshot: VaultRouterConfig | null;
  defaultVaultId: string | null;
}): VaultConfig[] {
  return collectAdditionalVaultConfigsCore({ ...params, includeLocalFolder: false });
}
