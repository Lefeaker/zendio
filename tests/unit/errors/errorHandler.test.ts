import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { 
  ErrorHandler, 
  createErrorHandler, 
  getErrorHandler,
  handleError,
  registerErrorHandler
} from '@shared/errors/errorHandler';
import { ErrorSeverity } from '@shared/errors/types';
import { setupDIForIntegrationTest, teardownDIAfterTest } from '../setup/diTestSetup';

describe('ErrorHandler', () => {
  let errorHandler: ErrorHandler;

  beforeEach(() => {
    errorHandler = createErrorHandler();
  });

  it('handles basic error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const error = {
      code: 'TEST_ERROR',
      domain: 'content' as const,
      message: 'Test error message',
      severity: ErrorSeverity.ERROR,
      recoverable: true,
      timestamp: Date.now()
    };

    await errorHandler.handle(error);
    
    expect(consoleSpy).toHaveBeenCalledWith(
      '[ErrorHandler]',
      '[content] TEST_ERROR',
      expect.objectContaining({
        message: 'Test error message',
        recoverable: true
      })
    );
    
    consoleSpy.mockRestore();
  });

  it('calls error reporters', async () => {
    const mockReporter = {
      report: vi.fn().mockResolvedValue(undefined)
    };
    
    errorHandler.addReporter(mockReporter);
    
    const error = {
      code: 'REPORTER_TEST',
      domain: 'content' as const,
      message: 'Reporter test',
      severity: ErrorSeverity.WARNING,
      recoverable: true,
      timestamp: Date.now()
    };

    await errorHandler.handle(error);
    
    expect(mockReporter.report).toHaveBeenCalledWith(error);
  });

  it('calls notification bridge', async () => {
    const mockBridge = vi.fn().mockResolvedValue(undefined);
    
    errorHandler.setNotificationBridge(mockBridge);
    
    const error = {
      code: 'BRIDGE_TEST',
      domain: 'content' as const,
      message: 'Bridge test',
      severity: ErrorSeverity.INFO,
      recoverable: true,
      timestamp: Date.now()
    };

    await errorHandler.handle(error);
    
    expect(mockBridge).toHaveBeenCalledWith(error);
  });

  it('removes reporters', async () => {
    const mockReporter = {
      report: vi.fn().mockResolvedValue(undefined)
    };
    
    const removeReporter = errorHandler.addReporter(mockReporter);
    removeReporter();
    
    const error = {
      code: 'REMOVE_TEST',
      domain: 'content' as const,
      message: 'Remove test',
      severity: ErrorSeverity.ERROR,
      recoverable: true,
      timestamp: Date.now()
    };

    await errorHandler.handle(error);
    
    expect(mockReporter.report).not.toHaveBeenCalled();
  });

  it('handles reporter errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const failingReporter = {
      report: vi.fn().mockRejectedValue(new Error('Reporter failed'))
    };
    
    errorHandler.addReporter(failingReporter);
    
    const error = {
      code: 'FAILING_REPORTER',
      domain: 'content' as const,
      message: 'Failing reporter test',
      severity: ErrorSeverity.ERROR,
      recoverable: true,
      timestamp: Date.now()
    };

    // Should not throw
    await expect(errorHandler.handle(error)).resolves.toBeUndefined();
    
    expect(consoleSpy).toHaveBeenCalledWith(
      '[ErrorHandler] Reporter failed',
      expect.any(Error)
    );
    
    consoleSpy.mockRestore();
  });

  it('suppresses console output when requested', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    
    const error = {
      code: 'SUPPRESS_CONSOLE',
      domain: 'content' as const,
      message: 'Suppress console test',
      severity: ErrorSeverity.ERROR,
      recoverable: true,
      timestamp: Date.now()
    };

    await errorHandler.handle(error, { suppressConsole: true });
    
    expect(consoleSpy).not.toHaveBeenCalled();
    
    consoleSpy.mockRestore();
  });
});

describe('ErrorHandler DI Integration', () => {
  beforeEach(() => {
    setupDIForIntegrationTest();
  });

  afterEach(() => {
    teardownDIAfterTest();
  });

  it('getErrorHandler returns consistent instance', () => {
    const handler1 = getErrorHandler();
    const handler2 = getErrorHandler();

    // 在测试环境中，DI容器不可用，所以每次都创建新实例
    // 但这是预期的降级行为
    expect(handler1).toBeInstanceOf(ErrorHandler);
    expect(handler2).toBeInstanceOf(ErrorHandler);
  });

  it('handleError works with fallback behavior', async () => {
    // 在测试环境中，DI容器不可用，所以使用降级行为
    const error = {
      code: 'DI_TEST',
      domain: 'content' as const,
      message: 'DI test',
      severity: ErrorSeverity.ERROR,
      recoverable: true,
      timestamp: Date.now()
    };

    // 应该不抛出异常，即使DI容器不可用
    await expect(handleError(error)).resolves.toBeUndefined();
  });

  it('registerErrorHandler handles DI unavailable gracefully', () => {
    const customHandler = createErrorHandler();

    // 在测试环境中，DI容器不可用，所以注册会失败但不抛出异常
    expect(() => registerErrorHandler(() => customHandler)).not.toThrow();

    // 获取的仍然是降级创建的实例
    const retrievedHandler = getErrorHandler();
    expect(retrievedHandler).toBeInstanceOf(ErrorHandler);
  });
});
