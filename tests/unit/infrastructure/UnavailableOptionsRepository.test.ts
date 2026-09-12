import { describe, expect, it, vi } from 'vitest';
import { UnavailableOptionsRepository } from '../../../src/infrastructure/repositories/UnavailableOptionsRepository';
import { OPTIONS_MUTATION_AUTHORITY_UNAVAILABLE } from '../../../src/shared/types/optionsMutationMessages';

describe('UnavailableOptionsRepository', () => {
  it('returns isolated immutable read snapshots and disposal-safe subscriptions', async () => {
    const repository = new UnavailableOptionsRepository({ interfaceTheme: 'dark' });
    const first = await repository.get();
    first.interfaceTheme = 'light';
    expect((await repository.get()).interfaceTheme).toBe('dark');

    const listener = vi.fn();
    const unsubscribe = repository.onChange(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    repository.dispose();
    repository.onChange(listener);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('rejects patch, strict replace, and migration cleanup without changing state or notifying', async () => {
    const repository = new UnavailableOptionsRepository({ interfaceTheme: 'system' });
    const listener = vi.fn();
    repository.onChange(listener);
    listener.mockClear();

    await expect(repository.patch({ path: ['interfaceTheme'], value: 'dark' })).rejects.toThrow(
      OPTIONS_MUTATION_AUTHORITY_UNAVAILABLE
    );
    await expect(repository.replace({ interfaceTheme: 'light' })).rejects.toThrow(
      OPTIONS_MUTATION_AUTHORITY_UNAVAILABLE
    );
    await expect(repository.deleteLegacyUsageStatsRoot()).rejects.toThrow(
      OPTIONS_MUTATION_AUTHORITY_UNAVAILABLE
    );

    expect((await repository.get()).interfaceTheme).toBe('system');
    expect(listener).not.toHaveBeenCalled();
  });
});
