import { afterEach, beforeEach } from 'vitest';
import { createTestPlatformHarness } from '../utils/platformTestHarness';
import { repositoryContainer } from '../../src/shared/di/serviceRegistry';
import { DI_TOKENS } from '../../src/shared/di/tokens';
import {
  MockOptionsRepository,
  MockMessagingRepository,
  MockYamlRepository,
  MockClipRepository,
  MockVideoRepository,
  MockReaderRepository
} from '../utils/repositories';

const harness = createTestPlatformHarness();

/**
 * Vitest runs in a Node environment, so DOM globals such as HTMLElement or
 * chrome.* APIs are absent by default. Provide lightweight stubs so unit tests
 * that depend on instanceof checks or chrome.runtime mocks can execute without
 * switching environments.
 */
function ensureDomConstructors(): void {
  if (typeof globalThis.HTMLElement === 'undefined') {
    class HTMLElementStub {}
    (globalThis as Record<string, unknown>).HTMLElement = HTMLElementStub;
  }

  if (typeof globalThis.Element === 'undefined') {
    (globalThis as Record<string, unknown>).Element = globalThis.HTMLElement;
  }

  const ensureCtor = (name: keyof typeof globalThis, factory: () => unknown) => {
    if (typeof globalThis[name] === 'undefined') {
      (globalThis as Record<string, unknown>)[name as string] = factory();
    }
  };

  ensureCtor('HTMLInputElement', () => {
    class HTMLInputElementStub extends globalThis.HTMLElement {}
    return HTMLInputElementStub;
  });

  ensureCtor('HTMLTextAreaElement', () => {
    class HTMLTextAreaElementStub extends globalThis.HTMLElement {}
    return HTMLTextAreaElementStub;
  });

  ensureCtor('HTMLSelectElement', () => {
    class HTMLSelectElementStub extends globalThis.HTMLElement {}
    return HTMLSelectElementStub;
  });

  ensureCtor('HTMLButtonElement', () => {
    class HTMLButtonElementStub extends globalThis.HTMLElement {}
    return HTMLButtonElementStub;
  });

  ensureCtor('HTMLFormElement', () => {
    class HTMLFormElementStub extends globalThis.HTMLElement {}
    return HTMLFormElementStub;
  });
}

type ChromeRuntimeStub = { lastError: { message?: string } | null };

function createRuntimeStub(): ChromeRuntimeStub {
  return {
    lastError: null
  };
}

function ensureChromeRuntime(): void {
  if (typeof globalThis.chrome === 'undefined') {
    globalThis.chrome = {
      runtime: createRuntimeStub()
    } as typeof chrome;
    return;
  }

  const chromeRef = globalThis.chrome as typeof chrome & {
    runtime?: typeof chrome.runtime & ChromeRuntimeStub;
  };

  if (typeof chromeRef.runtime !== 'object' || chromeRef.runtime === null) {
    chromeRef.runtime = createRuntimeStub() as typeof chrome.runtime & ChromeRuntimeStub;
    return;
  }

  (chromeRef.runtime as ChromeRuntimeStub).lastError = null;
}

ensureDomConstructors();
ensureChromeRuntime();

function registerTestRepositories(): void {
  repositoryContainer.registerSingleton(
    DI_TOKENS.IOptionsRepository,
    () => new MockOptionsRepository()
  );
  repositoryContainer.registerSingleton(
    DI_TOKENS.IMessagingRepository,
    () => new MockMessagingRepository()
  );
  repositoryContainer.registerSingleton(
    DI_TOKENS.IYamlRepository,
    () => new MockYamlRepository()
  );
  repositoryContainer.registerSingleton(
    DI_TOKENS.IClipRepository,
    () => new MockClipRepository()
  );
  repositoryContainer.registerSingleton(
    DI_TOKENS.IVideoRepository,
    () => new MockVideoRepository()
  );
  repositoryContainer.registerSingleton(
    DI_TOKENS.IReaderRepository,
    () => new MockReaderRepository()
  );
}

// ===== 关键修复：模块加载时立即配置平台服务 =====
// 解决模块 import 时 getService() 调用失败的问题
// 必须在 registerTestRepositories() 之前执行,因为 Repository 初始化可能依赖 platformServices
harness.configure();

registerTestRepositories();

beforeEach(() => {
  ensureDomConstructors();
  ensureChromeRuntime();
  harness.reset();
  harness.configure();  // 保留,确保每次测试都重置

  // ===== 注册 Mock Repositories =====
  // 确保所有测试都有可用的 Repository 实例
  repositoryContainer.reset();
  registerTestRepositories();
});

afterEach(() => {
  harness.reset();
  repositoryContainer.reset();
});

export { harness as testPlatformHarness };
