import { vi } from 'vitest';
import type { Mock } from 'vitest';
import type { CompleteOptions, StoredOptions } from '../../src/shared/types/options';

type ManagedChanges = Partial<CompleteOptions> & Record<string, unknown>;
type VaultRouterSnapshot = CompleteOptions['vaultRouter'] | null;

export interface OptionsManagedFixtures {
  managedChanges: ManagedChanges;
  vaultRouterSnapshot: VaultRouterSnapshot;
  savedOptions: Array<CompleteOptions | StoredOptions>;
  collectManagedSectionChanges: Mock<[snapshot: StoredOptions | null], ManagedChanges>;
  applyManagedSections: Mock<[options: CompleteOptions | StoredOptions], void>;
  getVaultRouterConfig: Mock<[], VaultRouterSnapshot>;
}

function attachDefaultImplementations(fixtures: OptionsManagedFixtures): void {
  fixtures.collectManagedSectionChanges.mockImplementation(() => fixtures.managedChanges);
  fixtures.applyManagedSections.mockImplementation(() => undefined);
  fixtures.getVaultRouterConfig.mockImplementation(() => fixtures.vaultRouterSnapshot);
}

export function createOptionsManagedFixtures(): OptionsManagedFixtures {
  const fixtures: OptionsManagedFixtures = {
    managedChanges: {},
    vaultRouterSnapshot: null,
    savedOptions: [],
    collectManagedSectionChanges: vi.fn<[StoredOptions | null], ManagedChanges>(),
    applyManagedSections: vi.fn<[CompleteOptions | StoredOptions], void>(),
    getVaultRouterConfig: vi.fn<[], VaultRouterSnapshot>()
  };

  attachDefaultImplementations(fixtures);
  return fixtures;
}

export function resetOptionsManagedFixtures(fixtures: OptionsManagedFixtures): void {
  fixtures.managedChanges = {};
  fixtures.vaultRouterSnapshot = null;
  fixtures.savedOptions.length = 0;

  fixtures.collectManagedSectionChanges.mockReset();
  fixtures.applyManagedSections.mockReset();
  fixtures.getVaultRouterConfig.mockReset();

  attachDefaultImplementations(fixtures);
}
