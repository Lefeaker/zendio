import { ClipperDialog } from './dialog';
import { getService } from '@shared/di';
import { TOKENS } from '@shared/di/tokens';
import type { PlatformServices } from '@platform/types';
import { getErrorHandlerInstance } from '@shared/errors';
import { resolveRepository } from '@shared/di/serviceRegistry';
import { DI_TOKENS } from '@shared/di/tokens';
import type { IClipRepository } from '@shared/repositories/IClipRepository';
import type { RuntimeService } from '@platform/interfaces/runtime';
import type { StorageService } from '@platform/interfaces/storage';
import type { ErrorHandler } from '@shared/errors';

/**
 * ClipperDialog 工厂函数
 * 提供依赖注入支持，遵循项目的架构规范
 */
export interface ClipperDialogDependencies {
  storageService?: StorageService;
  errorHandler?: ErrorHandler;
  runtimeService?: RuntimeService;
  clipRepository?: IClipRepository;
}

/**
 * 创建 ClipperDialog 实例
 *
 * @param dependencies 可选的依赖注入
 * @returns ClipperDialog 实例
 */
export function createClipperDialog(dependencies?: ClipperDialogDependencies): ClipperDialog {
  const platform = getService<PlatformServices>(TOKENS.platformServices);
  const storageService = dependencies?.storageService ?? platform.storage;
  const errorHandler = dependencies?.errorHandler ?? getErrorHandlerInstance();
  const runtimeService = dependencies?.runtimeService ?? platform.runtime;
  const clipRepository =
    dependencies?.clipRepository ?? resolveRepository<IClipRepository>(DI_TOKENS.IClipRepository);

  return new ClipperDialog({
    storage: storageService,
    errorHandler,
    runtime: runtimeService,
    clipRepo: clipRepository
  });
}

/**
 * 创建用于测试的 ClipperDialog 实例
 *
 * @param mockDependencies 测试用的 mock 依赖
 * @returns ClipperDialog 实例
 */
export function createTestClipperDialog(
  mockDependencies: ClipperDialogDependencies
): ClipperDialog {
  if (
    !mockDependencies.storageService ||
    !mockDependencies.errorHandler ||
    !mockDependencies.runtimeService ||
    !mockDependencies.clipRepository
  ) {
    throw new Error(
      'Test ClipperDialog requires storageService, runtimeService, clipRepository, and errorHandler mocks'
    );
  }

  return new ClipperDialog({
    storage: mockDependencies.storageService,
    runtime: mockDependencies.runtimeService,
    clipRepo: mockDependencies.clipRepository,
    errorHandler: mockDependencies.errorHandler
  });
}
