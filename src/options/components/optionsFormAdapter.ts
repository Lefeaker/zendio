import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import { mergeOptions } from '../../shared/config/optionsMerger';
import { sanitizeVaultRouterConfig } from '../../shared/config/optionsSanitizer';
import { getVaultRouterConfig } from '../state/vaultRouterStore';
import { deepClone } from '../utils/clone';

function buildBaselineOptions(previous: StoredOptions | null): CompleteOptions {
  const baseline = mergeOptions(previous);

  const vaultRouterSnapshot = sanitizeVaultRouterConfig(getVaultRouterConfig());
  if (vaultRouterSnapshot) {
    baseline.vaultRouter = vaultRouterSnapshot;
  }

  return deepClone(baseline);
}

export interface OptionsFormAdapter {
  read(previous: StoredOptions | null): CompleteOptions;
  apply(options: StoredOptions): Promise<void>;
}

export function createOptionsFormAdapter(): OptionsFormAdapter {
  return {
    read(previous: StoredOptions | null): CompleteOptions {
      const baseline = buildBaselineOptions(previous);
      return { ...baseline };
    },
    async apply(_options: StoredOptions): Promise<void> {
      // Schema shell owns form state; applying snapshots is handled by its store/widgets.
    }
  };
}
