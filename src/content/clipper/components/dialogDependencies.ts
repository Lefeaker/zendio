import { getService } from '@shared/di';
import type { StorageService } from '@platform/interfaces/storage';
import type { RuntimeService } from '@platform/interfaces/runtime';
import type { PlatformServices } from '@platform/types';
import type { ErrorHandler } from '@shared/errors';
import { getErrorHandlerInstance } from '@shared/errors';
import { resolveRepository } from '@shared/di/serviceRegistry';
import { DI_TOKENS, TOKENS } from '@shared/di/tokens';
import type { IClipRepository } from '@shared/repositories/IClipRepository';
import type { IOptionsRepository } from '@shared/repositories/IOptionsRepository';

export interface ClipperDialogDependencies {
  storage: StorageService;
  runtime: RuntimeService;
  clipRepo: IClipRepository;
  optionsRepository: IOptionsRepository;
  errorHandler: ErrorHandler;
}

export function createClipperDialogDependencies(): ClipperDialogDependencies {
  const platform = getService<PlatformServices>(TOKENS.platformServices);
  return {
    storage: platform.storage,
    runtime: platform.runtime,
    clipRepo: resolveRepository<IClipRepository>(DI_TOKENS.IClipRepository),
    optionsRepository: resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository),
    errorHandler: getErrorHandlerInstance()
  };
}
