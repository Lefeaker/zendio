import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createTestPlatformHarness } from '../../utils/platformTestHarness';

describe('Background Store (Phase B)', () => {
  const harness = createTestPlatformHarness();

  beforeEach(() => {
    vi.resetModules();
    harness.configure();
  });

  afterEach(() => {
    harness.reset();
  });

  it('should use the repository main chain instead of platform services', async () => {
    const mockOptions = {
      rest: { baseUrl: 'https://test.example.com/' },
      templates: { article: 'Test Article Template' }
    };

    const { repositoryContainer } = await import('../../../src/shared/di/serviceRegistry');
    const { DI_TOKENS } = await import('../../../src/shared/di/tokens');
    const getMock = vi.fn(async () => mockOptions);
    const testRepository = {
      get: getMock,
      set: vi.fn(async () => undefined),
      onChange: vi.fn(() => () => undefined)
    };

    repositoryContainer.reset();
    repositoryContainer.registerSingleton(DI_TOKENS.IOptionsRepository, () => testRepository);

    const { getOptions } = await import('../../../src/background/store');
    const options = await getOptions();

    expect(getMock).toHaveBeenCalledTimes(1);
    expect(options).toBeDefined();
    expect(options.rest?.baseUrl).toBe('https://test.example.com/');
    expect(options.templates?.article).toBe('Test Article Template');
  });

  it('should merge options with defaults', async () => {
    const partialOptions = {
      rest: { baseUrl: 'https://partial.example.com/' }
      // 缺少 templates 等其他字段
    };

    const { repositoryContainer } = await import('../../../src/shared/di/serviceRegistry');
    const { DI_TOKENS } = await import('../../../src/shared/di/tokens');
    const testRepository = {
      get: vi.fn(async () => partialOptions),
      set: vi.fn(async () => undefined),
      onChange: vi.fn(() => () => undefined)
    };

    repositoryContainer.reset();
    repositoryContainer.registerSingleton(DI_TOKENS.IOptionsRepository, () => testRepository);

    const { getOptions } = await import('../../../src/background/store');
    const options = await getOptions();

    expect(options).toBeDefined();
    expect(options.rest?.baseUrl).toBe('https://partial.example.com/');
    expect(options.templates).toBeDefined();
    expect(options.templates?.article).toBeDefined();
  });
});
