import { beforeEach, describe, expect, it, vi } from 'vitest';

const getServiceMock = vi.hoisted(() => vi.fn());
const resolveRepositoryMock = vi.hoisted(() => vi.fn());
const getErrorHandlerInstanceMock = vi.hoisted(() => vi.fn());

vi.mock('../../../src/shared/di', () => ({
  getService: getServiceMock
}));

vi.mock('../../../src/shared/di/serviceRegistry', () => ({
  resolveRepository: resolveRepositoryMock
}));

vi.mock('../../../src/shared/errors', () => ({
  getErrorHandlerInstance: getErrorHandlerInstanceMock
}));

describe('createClipperDialogDependencies', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('assembles storage, runtime, repository, and error handler from resolver boundaries', async () => {
    const storage = { sync: {}, local: {}, session: {} };
    const runtime = { getURL: vi.fn() };
    const clipRepo = { save: vi.fn() };
    const optionsRepository = { get: vi.fn() };
    const errorHandler = { handle: vi.fn() };

    getServiceMock.mockReturnValue({ storage, runtime });
    resolveRepositoryMock.mockReturnValueOnce(clipRepo).mockReturnValueOnce(optionsRepository);
    getErrorHandlerInstanceMock.mockReturnValue(errorHandler);

    const { createClipperDialogDependencies } = await import(
      '../../../src/content/clipper/components/dialogDependencies'
    );
    const deps = createClipperDialogDependencies();

    expect(getServiceMock).toHaveBeenCalledTimes(1);
    expect(resolveRepositoryMock).toHaveBeenCalledTimes(2);
    expect(getErrorHandlerInstanceMock).toHaveBeenCalledTimes(1);
    expect(deps).toEqual({
      storage,
      runtime,
      clipRepo,
      optionsRepository,
      errorHandler
    });
  });
});
