import { getService, resolveRepository } from '../../shared/di';
import { DI_TOKENS, TOKENS } from '../../shared/di/tokens';
import type { PlatformServices } from '../../platform/types';
import type { IMessagingRepository } from '../../shared/repositories';

export interface SupportPromptDependencies {
  storage: PlatformServices['storage'];
  runtime: PlatformServices['runtime'];
  messaging: IMessagingRepository;
}

export function resolveSupportPromptDependencies(): SupportPromptDependencies {
  const platformServices = getService<PlatformServices>(TOKENS.platformServices);
  return {
    storage: platformServices.storage,
    runtime: platformServices.runtime,
    messaging: resolveRepository<IMessagingRepository>(DI_TOKENS.IMessagingRepository)
  };
}
