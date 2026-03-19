import type { OptionsState } from '../shared/types';
import { DEFAULT_OPTIONS, mergeOptions } from '../shared/config';
import { resolveRepository } from '../shared/di/serviceRegistry';
import { DI_TOKENS } from '../shared/di/tokens';
import type { IOptionsRepository } from '../shared/repositories';

export type Options = OptionsState;

export async function getOptions(): Promise<Options> {
  const optionsRepository = resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
  const options = await optionsRepository.get();
  return mergeOptions(options);
}

export { DEFAULT_OPTIONS };
