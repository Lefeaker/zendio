import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ErrorSeverity } from '@shared/errors';
import type { NormalizedNotification } from '@shared/notifications/types';
import type { NotificationsService } from '../../../src/platform/interfaces/notifications';
import type { RuntimeService } from '../../../src/platform/interfaces/runtime';

const getMessagesMock = vi.fn();

vi.mock('../../../src/i18n', async () => {
  const actual = await vi.importActual<typeof import('../../../src/i18n')>('../../../src/i18n');
  return {
    ...actual,
    getMessages: getMessagesMock
  };
});

function createRuntimeStub(): RuntimeService {
  return {
    getURL: vi.fn((path: string) => `chrome-extension://test/${path}`),
    openOptionsPage: vi.fn(() => Promise.resolve(undefined)),
    onInstalled: vi.fn(() => () => undefined),
    onStartup: vi.fn(() => () => undefined)
  };
}

function createNotificationsStub(): NotificationsService {
  return {
    create: vi.fn(() => Promise.resolve(undefined)),
    clear: vi.fn(() => Promise.resolve(undefined))
  };
}

async function configureTestPlatformServices(overrides: {
  runtime?: RuntimeService;
  notifications?: NotificationsService;
}): Promise<void> {
  const { configurePlatformServices } = await import('../../../src/platform');
  configurePlatformServices(overrides);
}

async function resetTestPlatformServices(): Promise<void> {
  const { resetPlatformServices } = await import('../../../src/platform');
  resetPlatformServices();
}

describe('notifications service', () => {
  const messages = {
    clipSuccess: 'Clip Succeeded',
    clipSuccessLocalFolder: 'Saved to local folder: {folderName}',
    clipSuccessRestApi: 'Saved via REST API to: {vaultName}',
    clipSuccessRestFallback: 'Local folder unavailable; saved via REST API',
    clipSuccessDownloads: 'Saved to Downloads: {filePath}',
    clipFailed: 'Clip Failed',
    extractionFailed: 'Extraction Failed',
    scriptInjectionFailed: 'Script inject failed',
    classificationFallbackTitle: 'Classification Fallback',
    classificationFallbackMessage: 'Fallback because: {reason}',
    classificationFallbackDefaultReason: 'Automatic fallback'
  };

  beforeEach(() => {
    vi.resetModules();
    getMessagesMock.mockReset();
    getMessagesMock.mockResolvedValue(messages);

    return configureTestPlatformServices({
      runtime: createRuntimeStub(),
      notifications: createNotificationsStub()
    });
  });

  afterEach(() => {
    return resetTestPlatformServices().then(() => {
      vi.restoreAllMocks();
    });
  });

  it('sends success notification with vault name', async () => {
    const { notifyClipSuccess, setNotificationAdapter } = await import(
      '../../../src/background/services/notifications'
    );
    const createMock = vi.fn<[string, NormalizedNotification], void>();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

    setNotificationAdapter(createMock);
    await notifyClipSuccess('Articles/foo.md', {
      vaultName: 'MyVault',
      storageTarget: 'rest-api'
    });

    const lastCall = createMock.mock.lastCall;
    expect(lastCall).toBeDefined();
    const [notificationId, notification] = lastCall ?? [];
    expect(notificationId).toBe('clipper-success-1700000000000');
    expect(notification).toMatchObject({
      channel: 'clipper.success',
      severity: 'success',
      type: 'basic',
      iconUrl: 'chrome-extension://test/icons/bannerlogo-128.png',
      title: 'Clip Succeeded (MyVault)',
      message: 'Saved via REST API to: MyVault'
    });
    expect(notification?.timestamp).toBe(1700000000000);
    expect(notification?.metadata).toMatchObject({
      filePath: 'Articles/foo.md',
      vaultName: 'MyVault',
      storageTarget: 'rest-api'
    });

    setNotificationAdapter(null);
    nowSpy.mockRestore();
  });

  it('sends success notification without vault suffix when vault name missing', async () => {
    const { notifyClipSuccess, setNotificationAdapter } = await import(
      '../../../src/background/services/notifications'
    );
    const createMock = vi.fn<[string, NormalizedNotification], void>();

    setNotificationAdapter(createMock);
    await notifyClipSuccess('Inbox/foo.md');

    const [, notification] = createMock.mock.lastCall ?? [];
    expect(notification?.title).toBe('Clip Succeeded');
    expect(notification?.metadata).toMatchObject({
      filePath: 'Inbox/foo.md',
      vaultName: undefined
    });

    setNotificationAdapter(null);
  });

  it('describes local folder and REST fallback success without exposing absolute paths', async () => {
    const { notifyClipSuccess, setNotificationAdapter } = await import(
      '../../../src/background/services/notifications'
    );
    const createMock = vi.fn<[string, NormalizedNotification], void>();

    setNotificationAdapter(createMock);
    await notifyClipSuccess('Private/absolute/path/should/not/show.md', {
      storageTarget: 'local-folder',
      localFolderName: 'BlogVault',
      vaultName: 'RemoteBlog'
    });
    await notifyClipSuccess('Articles/foo.md', {
      storageTarget: 'rest-api',
      vaultName: 'RemoteBlog',
      localFolderName: 'BlogVault',
      fallbackReason: 'permission-denied'
    });

    expect(createMock.mock.calls[0]?.[1]).toMatchObject({
      severity: 'success',
      message: 'Saved to local folder: BlogVault',
      metadata: {
        storageTarget: 'local-folder',
        localFolderName: 'BlogVault',
        vaultName: 'RemoteBlog'
      }
    });
    expect(createMock.mock.calls[0]?.[1].message).not.toContain('Private/absolute/path');
    expect(createMock.mock.calls[1]?.[1]).toMatchObject({
      severity: 'info',
      message: 'Local folder unavailable; saved via REST API',
      metadata: {
        storageTarget: 'rest-api',
        fallbackReason: 'permission-denied',
        localFolderName: 'BlogVault',
        vaultName: 'RemoteBlog'
      }
    });

    setNotificationAdapter(null);
  });

  it('sends clip failure and extraction failure notifications', async () => {
    const { notifyClipFailure, notifyExtractionError, setNotificationAdapter } = await import(
      '../../../src/background/services/notifications'
    );
    const createMock = vi.fn<[string, NormalizedNotification], void>();

    setNotificationAdapter(createMock);
    await notifyClipFailure('Request timed out');
    await notifyExtractionError('DOM missing');

    const first = createMock.mock.calls[0]?.[1];
    const second = createMock.mock.calls[1]?.[1];
    expect(first).toMatchObject({
      channel: 'clipper.failure',
      severity: 'error',
      title: 'Clip Failed',
      message: 'Request timed out'
    });
    expect(second).toMatchObject({
      channel: 'clipper.error',
      severity: 'error',
      title: 'Extraction Failed',
      message: 'DOM missing'
    });

    setNotificationAdapter(null);
  });

  it('sends warning notification with trimmed or default fallback reason', async () => {
    const { notifyClipWarning, setNotificationAdapter } = await import(
      '../../../src/background/services/notifications'
    );
    const createMock = vi.fn<[string, NormalizedNotification], void>();

    setNotificationAdapter(createMock);
    await notifyClipWarning('  model degraded  ');
    await notifyClipWarning('   ');

    expect(createMock.mock.calls[0]?.[1]).toMatchObject({
      channel: 'clipper.warning',
      severity: 'warning',
      title: 'Classification Fallback',
      message: 'Fallback because: model degraded',
      metadata: { reason: 'model degraded' }
    });
    expect(createMock.mock.calls[1]?.[1]).toMatchObject({
      message: 'Fallback because: Automatic fallback',
      metadata: { reason: 'Automatic fallback' }
    });

    setNotificationAdapter(null);
  });

  it('sends injection failure notification with composed message', async () => {
    const { notifyInjectionFailure, setNotificationAdapter } = await import(
      '../../../src/background/services/notifications'
    );
    const createMock = vi.fn<[string, NormalizedNotification], void>();
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

    setNotificationAdapter(createMock);
    await notifyInjectionFailure('Extension disabled');

    const lastCall = createMock.mock.lastCall;
    expect(lastCall).toBeDefined();
    const [notificationId, notification] = lastCall ?? [];
    expect(notificationId).toBe('clipper-injection-1700000000000');
    expect(notification).toMatchObject({
      channel: 'clipper.injection',
      severity: 'error',
      type: 'basic',
      iconUrl: 'chrome-extension://test/icons/bannerlogo-128.png',
      title: 'Clip Failed',
      message: 'Script inject failed: Extension disabled'
    });
    expect(notification?.timestamp).toBe(1700000000000);
    expect(notification?.metadata).toMatchObject({
      error: 'Extension disabled'
    });

    setNotificationAdapter(null);
    nowSpy.mockRestore();
  });

  it('uses platform notifications when adapter is null', async () => {
    const notifications = createNotificationsStub();
    await configureTestPlatformServices({
      runtime: createRuntimeStub(),
      notifications
    });

    const { notifyClipFailure, setNotificationAdapter } = await import(
      '../../../src/background/services/notifications'
    );
    setNotificationAdapter(null);
    await notifyClipFailure('Platform path');

    expect(notifications.create).toHaveBeenCalledWith(
      expect.stringMatching(/^clipper-failure-/),
      expect.objectContaining({
        type: 'basic',
        title: 'Clip Failed',
        message: 'Platform path'
      })
    );
  });
});

it('dispatches generic app notifications with custom adapter payload normalization', async () => {
  const { notifyAppEvent, setNotificationAdapter } = await import(
    '../../../src/background/services/notifications'
  );
  const createMock = vi.fn<[string, NormalizedNotification], void>();
  const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000001234);

  setNotificationAdapter(createMock);
  await notifyAppEvent({
    channel: 'system.warning',
    severity: 'warning',
    title: 'Heads up',
    message: 'Something happened',
    iconUrl: 'icons/custom.png',
    contextMessage: 'More detail',
    requireInteraction: false,
    metadata: { source: 'unit-test' }
  });

  expect(createMock).toHaveBeenCalledWith(
    'system-warning-1700000001234',
    expect.objectContaining({
      channel: 'system.warning',
      severity: 'warning',
      type: 'basic',
      iconUrl: 'chrome-extension://test/icons/custom.png',
      contextMessage: 'More detail',
      requireInteraction: false,
      metadata: { source: 'unit-test' },
      timestamp: 1700000001234
    })
  );

  setNotificationAdapter(null);
  nowSpy.mockRestore();
});

it('preserves absolute icon urls for generic app notifications', async () => {
  const { notifyAppEvent, setNotificationAdapter } = await import(
    '../../../src/background/services/notifications'
  );
  const createMock = vi.fn<[string, NormalizedNotification], void>();

  setNotificationAdapter(createMock);
  await notifyAppEvent({
    channel: 'system.info',
    severity: 'info',
    title: 'External icon',
    message: 'Absolute icon should stay untouched',
    iconUrl: 'https://cdn.example.com/icon.png',
    requireInteraction: true
  });

  const [, notification] = createMock.mock.lastCall ?? [];
  expect(notification).toMatchObject({
    channel: 'system.info',
    severity: 'info',
    iconUrl: 'https://cdn.example.com/icon.png',
    requireInteraction: true
  });

  setNotificationAdapter(null);
});

it('routes options-domain errors through the notification bridge as user-facing alerts', async () => {
  const { setNotificationAdapter } = await import('../../../src/background/services/notifications');
  const { getErrorHandler } = await import('../../../src/shared/errors');
  const createMock = vi.fn<[string, NormalizedNotification], void>();
  const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000005678);

  setNotificationAdapter(createMock);
  await getErrorHandler().handle(
    {
      code: 'OPTIONS_SAVE_FAILED',
      domain: 'options',
      message: 'persist exploded',
      userMessage: 'Cannot save settings',
      severity: ErrorSeverity.ERROR,
      recoverable: false
    },
    {
      suppressConsole: true,
      suppressReporters: true
    }
  );

  const lastCall = createMock.mock.lastCall;
  expect(lastCall?.[0]).toBe('system-user-OPTIONS_SAVE_FAILED');
  expect(lastCall?.[1]).toMatchObject({
    channel: 'system.user',
    severity: 'error',
    title: 'All-in-Obsidian — Error',
    message: 'Cannot save settings',
    contextMessage: 'persist exploded',
    requireInteraction: true,
    metadata: {
      code: 'OPTIONS_SAVE_FAILED',
      domain: 'options',
      recoverable: false,
      severity: 'error',
      timestamp: 1700000005678
    },
    timestamp: 1700000005678
  });

  setNotificationAdapter(null);
  nowSpy.mockRestore();
});

it('falls back to app icon and about-page runtime url when generic notifications omit optional fields', async () => {
  await configureTestPlatformServices({
    runtime: {
      ...createRuntimeStub(),
      getURL: vi.fn(() => {
        throw new Error('runtime unavailable');
      })
    },
    notifications: createNotificationsStub()
  });
  const originalDocument = (globalThis as { document?: { baseURI?: string } }).document;
  (globalThis as { document?: { baseURI?: string } }).document = { baseURI: 'about:blank' };

  const { notifyAppEvent, setNotificationAdapter } = await import(
    '../../../src/background/services/notifications'
  );
  const createMock = vi.fn<[string, NormalizedNotification], void>();

  setNotificationAdapter(createMock);
  await notifyAppEvent({
    channel: 'system.state',
    severity: 'info',
    title: 'State changed',
    message: 'All good',
    iconUrl: 'icons/state.png'
  });
  await notifyAppEvent({
    channel: 'system.state',
    severity: 'info',
    title: 'State changed',
    message: 'Default icon path'
  });

  expect(createMock.mock.calls[0]?.[1]).toMatchObject({
    channel: 'system.state',
    iconUrl: 'chrome-extension://test/icons/state.png'
  });
  expect(createMock.mock.calls[1]?.[1]).toMatchObject({
    channel: 'system.state',
    iconUrl: 'icons/bannerlogo-128.png'
  });
  expect(createMock.mock.calls[1]?.[1]).not.toHaveProperty('contextMessage');
  expect(createMock.mock.calls[1]?.[1]).not.toHaveProperty('requireInteraction');

  setNotificationAdapter(null);
  (globalThis as { document?: { baseURI?: string } }).document = originalDocument;
});

it('routes generic info errors through the notification bridge as non-blocking system notices', async () => {
  const { setNotificationAdapter } = await import('../../../src/background/services/notifications');
  const { getErrorHandler } = await import('../../../src/shared/errors');
  const createMock = vi.fn<[string, NormalizedNotification], void>();

  setNotificationAdapter(createMock);

  await getErrorHandler().handle(
    {
      code: 'SYSTEM_INFO',
      domain: 'background',
      message: 'Informational only',
      severity: ErrorSeverity.INFO,
      recoverable: true
    },
    {
      suppressConsole: true,
      suppressReporters: true
    }
  );

  expect(createMock.mock.calls[0]?.[1]).toMatchObject({
    channel: 'system.info',
    severity: 'info',
    title: 'All-in-Obsidian — Info',
    message: 'Informational only',
    requireInteraction: false
  });

  setNotificationAdapter(null);
});

it('passes contextMessage and requireInteraction through platform notification options', async () => {
  getMessagesMock.mockResolvedValue({
    clipSuccess: 'Clip Succeeded',
    clipFailed: 'Clip Failed',
    extractionFailed: 'Extraction Failed',
    scriptInjectionFailed: 'Script inject failed',
    classificationFallbackTitle: 'Classification Fallback',
    classificationFallbackMessage: 'Fallback because: {reason}',
    classificationFallbackDefaultReason: 'Automatic fallback'
  });
  const notifications = createNotificationsStub();
  await configureTestPlatformServices({
    runtime: createRuntimeStub(),
    notifications
  });

  const { notifyAppEvent, setNotificationAdapter } = await import(
    '../../../src/background/services/notifications'
  );
  setNotificationAdapter(null);

  await notifyAppEvent({
    channel: 'system.error',
    severity: 'error',
    title: 'Platform route',
    message: 'Primary message',
    contextMessage: 'Expanded detail',
    requireInteraction: true
  });

  expect(notifications.create).toHaveBeenCalledWith(
    expect.stringMatching(/^system-error-/),
    expect.objectContaining({
      type: 'basic',
      title: 'Platform route',
      message: 'Primary message',
      contextMessage: 'Expanded detail',
      requireInteraction: true
    })
  );
});

it('routes extraction-domain failures through clip failure notifications with metadata context', async () => {
  getMessagesMock.mockResolvedValue({
    clipSuccess: 'Clip Succeeded',
    clipFailed: 'Clip Failed',
    extractionFailed: 'Extraction Failed',
    scriptInjectionFailed: 'Script inject failed',
    classificationFallbackTitle: 'Classification Fallback',
    classificationFallbackMessage: 'Fallback because: {reason}',
    classificationFallbackDefaultReason: 'Automatic fallback'
  });
  await configureTestPlatformServices({
    runtime: createRuntimeStub(),
    notifications: createNotificationsStub()
  });
  const { setNotificationAdapter } = await import('../../../src/background/services/notifications');
  const { getErrorHandler } = await import('../../../src/shared/errors');
  const createMock = vi.fn<[string, NormalizedNotification], void>();
  const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(1700000009999);

  setNotificationAdapter(createMock);
  await getErrorHandler().handle(
    {
      code: 'EXTRACTION_FATAL',
      domain: 'extraction',
      message: 'raw extractor failure',
      userMessage: 'Unable to extract page',
      severity: ErrorSeverity.CRITICAL,
      recoverable: false,
      context: { selector: '.article' },
      timestamp: 1700000009999
    },
    {
      suppressConsole: true,
      suppressReporters: true
    }
  );

  expect(createMock.mock.calls[0]?.[0]).toBe('clipper-failure-EXTRACTION_FATAL');
  expect(createMock.mock.calls[0]?.[1]).toMatchObject({
    channel: 'clipper.failure',
    severity: 'critical',
    title: 'Clip Failed',
    message: 'Unable to extract page',
    contextMessage: 'raw extractor failure',
    requireInteraction: true,
    metadata: {
      code: 'EXTRACTION_FATAL',
      domain: 'extraction',
      recoverable: false,
      severity: 'critical',
      context: { selector: '.article' },
      timestamp: 1700000009999
    },
    timestamp: 1700000009999
  });

  setNotificationAdapter(null);
  nowSpy.mockRestore();
});

it('routes content warning errors through classification fallback notifications', async () => {
  getMessagesMock.mockResolvedValue({
    clipSuccess: 'Clip Succeeded',
    clipFailed: 'Clip Failed',
    extractionFailed: 'Extraction Failed',
    scriptInjectionFailed: 'Script inject failed',
    classificationFallbackTitle: 'Classification Fallback',
    classificationFallbackMessage: 'Fallback because: {reason}',
    classificationFallbackDefaultReason: 'Automatic fallback'
  });
  await configureTestPlatformServices({
    runtime: createRuntimeStub(),
    notifications: createNotificationsStub()
  });
  const { setNotificationAdapter } = await import('../../../src/background/services/notifications');
  const { getErrorHandler } = await import('../../../src/shared/errors');
  const createMock = vi.fn<[string, NormalizedNotification], void>();

  setNotificationAdapter(createMock);
  await getErrorHandler().handle(
    {
      code: 'CONTENT_WARN',
      domain: 'content',
      message: 'classifier timeout',
      userMessage: 'Fallback to simplified mode',
      severity: ErrorSeverity.WARNING,
      recoverable: true
    },
    {
      suppressConsole: true,
      suppressReporters: true
    }
  );

  expect(createMock.mock.calls[0]?.[1]).toMatchObject({
    channel: 'clipper.warning',
    severity: 'warning',
    title: 'Classification Fallback',
    message: 'Fallback because: Fallback to simplified mode',
    contextMessage: 'classifier timeout',
    requireInteraction: false,
    metadata: {
      code: 'CONTENT_WARN',
      domain: 'content',
      recoverable: true,
      severity: 'warning',
      reason: 'Fallback to simplified mode'
    }
  });

  setNotificationAdapter(null);
});

it('routes generic warning errors through system warning channel without context duplication', async () => {
  getMessagesMock.mockResolvedValue({
    clipSuccess: 'Clip Succeeded',
    clipFailed: 'Clip Failed',
    extractionFailed: 'Extraction Failed',
    scriptInjectionFailed: 'Script inject failed',
    classificationFallbackTitle: 'Classification Fallback',
    classificationFallbackMessage: 'Fallback because: {reason}',
    classificationFallbackDefaultReason: 'Automatic fallback'
  });
  await configureTestPlatformServices({
    runtime: createRuntimeStub(),
    notifications: createNotificationsStub()
  });
  const { setNotificationAdapter } = await import('../../../src/background/services/notifications');
  const { getErrorHandler } = await import('../../../src/shared/errors');
  const createMock = vi.fn<[string, NormalizedNotification], void>();

  setNotificationAdapter(createMock);
  await getErrorHandler().handle(
    {
      code: 'SYSTEM_WARN',
      domain: 'background',
      message: 'Same text',
      userMessage: 'Same text',
      severity: ErrorSeverity.WARNING,
      recoverable: true
    },
    {
      suppressConsole: true,
      suppressReporters: true
    }
  );

  expect(createMock.mock.calls[0]?.[1]).toMatchObject({
    channel: 'system.warning',
    severity: 'warning',
    title: 'All-in-Obsidian — Warning',
    message: 'Same text',
    requireInteraction: false
  });
  expect(createMock.mock.calls[0]?.[1]).not.toHaveProperty('contextMessage');

  setNotificationAdapter(null);
});

it('dispatches unknown-domain app errors through the generic system-error path', async () => {
  const { setNotificationAdapter } = await import('../../../src/background/services/notifications');
  const { getErrorHandler } = await import('../../../src/shared/errors');
  const createMock = vi.fn<[string, NormalizedNotification], void>();
  setNotificationAdapter(createMock);

  await getErrorHandler().handle(
    {
      code: 'UNKNOWN',
      domain: 'unknown',
      severity: ErrorSeverity.CRITICAL,
      message: '',
      userMessage: '',
      recoverable: false
    },
    {
      suppressConsole: true,
      suppressReporters: true
    }
  );

  expect(createMock).toHaveBeenCalledTimes(1);
  expect(createMock.mock.calls[0]?.[1]).toMatchObject({
    channel: 'system.error',
    severity: 'critical',
    requireInteraction: true
  });
  setNotificationAdapter(null);
});

it('falls back through error bridge when notification dispatch rejects', async () => {
  await configureTestPlatformServices({
    runtime: createRuntimeStub(),
    notifications: createNotificationsStub()
  });
  const { setNotificationAdapter } = await import('../../../src/background/services/notifications');
  const { getErrorHandler } = await import('../../../src/shared/errors');
  const rejectAdapter = vi.fn(() => Promise.reject(new Error('dispatch exploded')));

  setNotificationAdapter(rejectAdapter);
  await expect(
    getErrorHandler().handle(
      {
        code: 'DISPATCH_FAIL_CASE',
        domain: 'background',
        message: 'Bridge failure',
        userMessage: 'Bridge failure',
        severity: ErrorSeverity.ERROR,
        recoverable: false
      },
      {
        suppressConsole: true,
        suppressReporters: true
      }
    )
  ).resolves.toBeUndefined();

  expect(rejectAdapter).toHaveBeenCalled();
  setNotificationAdapter(null);
});

it('keeps data icon urls untouched for generic notifications', async () => {
  const { notifyAppEvent, setNotificationAdapter } = await import(
    '../../../src/background/services/notifications'
  );
  const createMock = vi.fn<[string, NormalizedNotification], void>();

  setNotificationAdapter(createMock);
  await notifyAppEvent({
    channel: 'system.info',
    severity: 'critical',
    title: 'Data icon',
    message: 'inline icon',
    iconUrl: 'data:image/png;base64,abc'
  });

  expect(createMock.mock.calls[0]?.[1]).toMatchObject({
    severity: 'critical',
    type: 'basic',
    iconUrl: 'data:image/png;base64,abc'
  });
  setNotificationAdapter(null);
});

it('keeps generic info notifications non-interactive and preserves distinct context messages', async () => {
  const { setNotificationAdapter } = await import('../../../src/background/services/notifications');
  const { getErrorHandler } = await import('../../../src/shared/errors');
  const createMock = vi.fn<[string, NormalizedNotification], void>();
  setNotificationAdapter(createMock);

  await getErrorHandler().handle(
    {
      code: 'SYSTEM_INFO_CASE',
      domain: 'background',
      message: 'debug detail',
      userMessage: 'friendly info',
      severity: ErrorSeverity.INFO,
      recoverable: true
    },
    {
      suppressConsole: true,
      suppressReporters: true
    }
  );

  expect(createMock.mock.calls[0]?.[1]).toMatchObject({
    channel: 'system.info',
    severity: 'info',
    title: 'All-in-Obsidian — Info',
    message: 'friendly info',
    contextMessage: 'debug detail',
    requireInteraction: false
  });
  setNotificationAdapter(null);
});

it('uses default app icon when generic notifications omit iconUrl', async () => {
  const { notifyAppEvent, setNotificationAdapter } = await import(
    '../../../src/background/services/notifications'
  );
  const createMock = vi.fn<[string, NormalizedNotification], void>();

  setNotificationAdapter(createMock);
  await notifyAppEvent({
    channel: 'system.info',
    severity: 'info',
    title: 'Plain event',
    message: 'No icon path'
  });

  expect(createMock.mock.calls[0]?.[1]).toMatchObject({
    iconUrl: 'icons/bannerlogo-128.png',
    type: 'basic',
    severity: 'info'
  });
  setNotificationAdapter(null);
});

it('routes i18n warning errors through the user-facing channel without context duplication', async () => {
  const { setNotificationAdapter } = await import('../../../src/background/services/notifications');
  const { getErrorHandler } = await import('../../../src/shared/errors');
  const createMock = vi.fn<[string, NormalizedNotification], void>();
  setNotificationAdapter(createMock);

  await getErrorHandler().handle(
    {
      code: 'I18N_WARN_CASE',
      domain: 'i18n',
      message: 'Visible warning',
      userMessage: 'Visible warning',
      severity: ErrorSeverity.WARNING,
      recoverable: true
    },
    {
      suppressConsole: true,
      suppressReporters: true
    }
  );

  expect(createMock.mock.calls[0]?.[1]).toMatchObject({
    channel: 'system.user',
    severity: 'warning',
    title: 'All-in-Obsidian — Warning',
    message: 'Visible warning',
    requireInteraction: false
  });
  expect(createMock.mock.calls[0]?.[1]).not.toHaveProperty('contextMessage');
  setNotificationAdapter(null);
});
