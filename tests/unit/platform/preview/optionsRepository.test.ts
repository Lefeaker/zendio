import { describe, expect, it, vi } from 'vitest';
import { createPreviewOptionsRepository } from '../../../../src/platform/preview/optionsRepository';
import { OptionsMutationError } from '../../../../src/shared/types/optionsMutationMessages';

describe('preview options repository', () => {
  it('applies typed patches and publishes the updated preview snapshot', async () => {
    const repository = createPreviewOptionsRepository();
    const listener = vi.fn();
    const unsubscribe = repository.onChange(listener);

    const updated = await repository.patch({ path: ['interfaceTheme'], value: 'dark' });

    expect(updated.interfaceTheme).toBe('dark');
    expect((await repository.get()).interfaceTheme).toBe('dark');
    expect(listener).toHaveBeenLastCalledWith(expect.objectContaining({ interfaceTheme: 'dark' }));
    unsubscribe();
  });

  it('strictly replaces preview options and rejects empty mutation batches', async () => {
    const repository = createPreviewOptionsRepository({ interfaceTheme: 'dark' });

    await expect(repository.replace({ interfaceTheme: 'light' })).resolves.toMatchObject({
      interfaceTheme: 'light'
    });
    await expect(repository.patch([])).rejects.toEqual(
      new OptionsMutationError('INVALID_OPTIONS_MUTATION')
    );
  });
});
