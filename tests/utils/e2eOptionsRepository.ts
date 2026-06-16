import { vi } from 'vitest';
import { mergeOptions } from '../../src/shared/config/optionsMerger';
import { repositoryContainer } from '../../src/shared/di/serviceRegistry';
import { DI_TOKENS } from '../../src/shared/di/tokens';
import type { IOptionsRepository } from '../../src/shared/repositories/IOptionsRepository';
import type { CompleteOptions } from '../../src/shared/types/options';

export function createE2eOptionsRepository(
  overrides: Partial<CompleteOptions>
): IOptionsRepository {
  const options = mergeOptions(overrides) as CompleteOptions;

  const repository: IOptionsRepository = {
    get: vi.fn(async () => options),
    set: vi.fn(async (_nextOptions: Partial<CompleteOptions>) => undefined),
    onChange: vi.fn((callback) => {
      callback(options);
      return () => undefined;
    })
  };

  repositoryContainer.registerSingleton(DI_TOKENS.IOptionsRepository, () => repository);
  return repository;
}
