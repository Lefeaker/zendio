/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { restErrors } from '@shared/errors';
import { ErrorSeverity } from '@shared/errors/types';

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

type MockContentI18nResource = {
  language?: string;
  messages: Record<string, string> | null;
};

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error?: unknown) => void;
};

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

vi.mock('focus-trap', () => ({
  createFocusTrap: () => ({
    activate: vi.fn(),
    deactivate: vi.fn(),
    pause: vi.fn(),
    unpause: vi.fn()
  })
}));

const loadExtensionStyleMock = vi.hoisted(() =>
  vi.fn((path: string) => Promise.resolve(`/* ${path} */ .stitch-runtime{display:block;}`))
);
vi.mock('@content/clipper/shared/styleRegistry', () => ({
  loadExtensionStyle: loadExtensionStyleMock
}));

const ensureContentI18nMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const getContentI18nResourceMock = vi.hoisted(() =>
  vi.fn<() => MockContentI18nResource>(() => ({ messages: null }))
);
const getContentMessagesMock = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      supportPromptDialogLabel: 'Support Zendio',
      supportPromptTitle: 'Support Zendio',
      supportPromptKoFiTitle: 'Ko-fi',
      supportPromptKoFiDescription: 'Buy me a coffee',
      supportPromptAfdianTitle: '微信赞赏',
      supportPromptAfdianDescription: '扫码支持',
      supportPromptGithubTitle: 'GitHub',
      supportPromptGithubDescription: 'File feedback',
      supportPromptFeedbackGroupLabel: 'Quick feedback',
      supportPromptLikeLabel: 'Thumbs up',
      supportPromptDislikeLabel: 'Thumbs down',
      supportPromptDismiss: 'Click outside to close',
      supportPromptStatusSuccess: 'Sent',
      supportPromptStatusSuccessWithVault: 'Sent to {vault}',
      supportPromptStatusWarning: 'Saved with warning',
      supportPromptStatusWarningWithReason: 'Saved with warning: {reason}',
      supportPromptStatusFailure: 'Failed',
      supportPromptStatusFailureWithReason: 'Failed: {reason}',
      supportProgressWritingNote: 'Writing note',
      supportProgressSendingToObsidian: 'Sending to Obsidian',
      supportProgressErrorCodeSuffix: ' (code: {code})',
      errorRestRequestFailed:
        'Request failed. We will retry shortly, or check the network and try again.',
      localVaultWriteFailed: 'Failed to write to the local folder: {folderName}',
      localVaultWriteReauthorizationRequired:
        'Local folder needs to be reauthorized. Reauthorize "{folderName}" in Settings.',
      supportPromptLikeThankYou: 'Thanks!',
      supportPromptReviewLinkLabel: 'Write review',
      supportPromptReviewAcknowledgedLabel: 'I already reviewed',
      supportPromptDislikeToastTitle: 'Share feedback',
      supportPromptDislikeRedditLinkLabel: 'Reddit',
      supportPromptDislikeQrLinkLabel: '小红书',
      supportPromptDislikeQrCaption: '使用小红书扫码入群',
      supportPromptDislikeQrPlaceholder: 'QR soon'
    })
  )
);
vi.mock('@content/i18n/context', () => ({
  ensureContentI18n: ensureContentI18nMock,
  getContentI18nResource: getContentI18nResourceMock,
  getContentMessages: getContentMessagesMock
}));

const storageLocalGetMock = vi.hoisted(() => vi.fn(() => Promise.resolve({})));
const storageLocalSetMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const runtimeGetURLMock = vi.hoisted(() => vi.fn((path: string) => `chrome-extension://${path}`));
const messagingSendMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const getServiceMock = vi.hoisted(() =>
  vi.fn(() => ({
    storage: {
      local: { get: storageLocalGetMock, set: storageLocalSetMock },
      sync: {},
      session: {}
    },
    runtime: { getURL: runtimeGetURLMock }
  }))
);
const resolveRepositoryMock = vi.hoisted(() => vi.fn(() => ({ send: messagingSendMock })));
vi.mock('@shared/di', async () => {
  const actual = await vi.importActual<typeof import('@shared/di')>('@shared/di');
  return {
    ...actual,
    getService: getServiceMock,
    resolveRepository: resolveRepositoryMock
  };
});

function getPromptHost(): HTMLElement {
  const host = document.getElementById('aiob-support-prompt');
  if (!host) throw new Error('support prompt host missing');
  return host;
}

function getToastShadow(): ShadowRoot {
  const host = document.getElementById('aiob-support-toast-host');
  if (!host?.shadowRoot) {
    throw new Error('support toast host missing');
  }
  return host.shadowRoot;
}

describe('SupportPrompt', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.resetModules();
    vi.clearAllMocks();
    Reflect.deleteProperty(globalThis, 'chrome');
    storageLocalGetMock.mockResolvedValue({});
    storageLocalSetMock.mockResolvedValue(undefined);
    messagingSendMock.mockResolvedValue(undefined);
    loadExtensionStyleMock.mockImplementation((path: string) =>
      Promise.resolve(`/* ${path} */ .stitch-runtime{display:block;}`)
    );
  });

  afterEach(() => {
    vi.doUnmock('../../../src/i18n/catalog/runtimeFallbackMessages');
  });

  it('renders success state with Stitch task-success content', async () => {
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'success', vaultName: 'Main Vault' });

    const shadow = getPromptHost().shadowRoot;
    expect(shadow?.querySelector('[data-role="like-btn"]')).toBeTruthy();
    expect(shadow?.querySelector('[data-role="dislike-btn"]')).toBeTruthy();
    expect(shadow?.querySelectorAll('.task-support-link').length).toBe(2);
    expect(shadow?.querySelectorAll('.task-support-link[href]').length).toBe(1);
    expect(shadow?.textContent).toContain('微信赞赏');
    expect(
      shadow?.querySelector<HTMLImageElement>('img.task-support-logo[src$="wechat-reward.svg"]')
    ).toBeTruthy();
    expect(shadow?.querySelector<HTMLImageElement>('img.task-support-qr')).toBeNull();
    expect(shadow?.querySelector('[data-role="status-text"]')?.textContent).toContain(
      'Sent to Main Vault'
    );
    expect(shadow?.querySelector('[data-role="dismiss-text"]')?.textContent).toBe(
      'Click outside to close'
    );
  });

  it('opens the WeChat reward QR in a standalone support popup after clicking the WeChat support card', async () => {
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'success' });

    const shadow = getPromptHost().shadowRoot;
    expect(shadow?.querySelector<HTMLImageElement>('img.task-support-qr')).toBeNull();
    expect(document.querySelector('#aiob-support-toast-host')).toBeNull();

    shadow?.querySelector<HTMLButtonElement>('[data-role="wechat-reward-btn"]')?.click();
    await flushMicrotasks();

    expect(shadow?.querySelector<HTMLImageElement>('img.task-support-qr')).toBeNull();
    expect(
      shadow?.querySelector<HTMLImageElement>('img.task-support-logo[src$="wechat-reward.svg"]')
    ).toBeTruthy();

    const rewardPopup = document.querySelector('#aiob-support-toast-host')?.shadowRoot;
    const rewardToast = rewardPopup?.querySelector<HTMLElement>('.support-prompt-toast.reward-qr');
    expect(rewardToast).toBeTruthy();
    expect(rewardToast?.textContent?.trim()).toBe('');
    expect(
      rewardToast
        ?.querySelector<HTMLImageElement>('[data-role="wechat-reward-qr-image"]')
        ?.getAttribute('src')
    ).toBe('chrome-extension://icons/wechat-reward-qr.jpg');
  });

  it('renders an in-flight progress strip before the support links', async () => {
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    const progress = {
      value: 42,
      label: '正在写入笔记',
      message: {
        key: 'supportProgressWritingNote',
        fallback: 'Writing note'
      }
    };
    await prompt.show({
      status: 'progress',
      progress
    });

    const shadow = getPromptHost().shadowRoot;
    const header = shadow?.querySelector('.task-success-header');
    const progressBar = shadow?.querySelector<HTMLElement>('[data-role="task-progress"]');
    const supportStrip = shadow?.querySelector('.task-support-strip');

    expect(shadow?.querySelector('[data-role="status-text"]')?.textContent).toBe('Writing note');
    expect(shadow?.querySelector('[data-role="status-text"]')?.textContent).not.toMatch(
      /[\u3400-\u9fff]/u
    );
    expect(progressBar).toBeTruthy();
    expect(progressBar?.style.getPropertyValue('--task-progress-value')).toBe('42%');
    expect(progressBar?.classList.contains('is-progress')).toBe(true);
    expect(header?.compareDocumentPosition(progressBar as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(progressBar?.compareDocumentPosition(supportStrip as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it('keeps one prompt host when progress updates race during async render', async () => {
    const messagesGate = createDeferred<void>();
    ensureContentI18nMock.mockReturnValueOnce(messagesGate.promise);
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);

    const firstShow = prompt.show({
      status: 'progress',
      progress: { value: 8, label: '第一步' }
    });
    const secondShow = prompt.show({
      status: 'progress',
      progress: { value: 42, label: '第二步' }
    });

    expect(document.querySelectorAll('#aiob-support-prompt')).toHaveLength(0);
    messagesGate.resolve();
    await Promise.all([firstShow, secondShow]);

    expect(document.querySelectorAll('#aiob-support-prompt')).toHaveLength(1);
    expect(
      document
        .querySelector('#aiob-support-prompt')
        ?.shadowRoot?.querySelector('[data-role="status-text"]')?.textContent
    ).toBe('第二步');
  });

  it('keeps terminal progress prompts visible until the user clicks outside', async () => {
    vi.useFakeTimers();
    try {
      const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
      const prompt = new SupportPrompt(document);
      await prompt.show({
        status: 'success',
        progress: { value: 100, label: '成功发送到 Obsidian', variant: 'success' }
      });

      expect(document.getElementById('aiob-support-prompt')).toBeTruthy();
      await vi.advanceTimersByTimeAsync(10000);

      expect(document.getElementById('aiob-support-prompt')).toBeTruthy();
      getPromptHost()
        .shadowRoot?.querySelector<HTMLDivElement>('.resource-modal-overlay')
        ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

      expect(document.getElementById('aiob-support-prompt')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders warning and failure details', async () => {
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'warning', errorMessage: 'classifier fallback' });
    let shadow = getPromptHost().shadowRoot;
    expect(shadow?.querySelector('[data-role="status-text"]')?.textContent).toContain(
      'classifier fallback'
    );

    prompt.hide();
    await prompt.show({
      status: 'failure',
      error: {
        code: 'FAIL_X',
        message: 'boom',
        userMessage: 'send failed',
        severity: ErrorSeverity.ERROR,
        domain: 'content',
        recoverable: true,
        timestamp: Date.now(),
        context: { contextMessage: 'extra detail' }
      }
    });
    shadow = getPromptHost().shadowRoot;
    expect(shadow?.querySelector('[data-role="status-text"]')?.textContent).toContain(
      'send failed'
    );
    expect(shadow?.querySelector('[data-role="status-text"]')?.textContent).toContain(
      '(code: FAIL_X)'
    );
    expect(shadow?.querySelector('[data-role="status-detail"]')?.textContent).toBe('extra detail');
  });

  it('uses catalog-derived fallback messages when content i18n fails before loading', async () => {
    ensureContentI18nMock.mockRejectedValueOnce(new Error('content i18n unavailable'));
    const actualFallbacks = await vi.importActual<
      typeof import('../../../src/i18n/catalog/runtimeFallbackMessages')
    >('../../../src/i18n/catalog/runtimeFallbackMessages');
    vi.doMock('../../../src/i18n/catalog/runtimeFallbackMessages', () => ({
      ...actualFallbacks,
      RUNTIME_FALLBACK_MESSAGES: {
        ...actualFallbacks.RUNTIME_FALLBACK_MESSAGES,
        supportPromptDialogLabel: 'Dialog sentinel',
        supportPromptTitle: 'Title sentinel',
        supportProgressSendingToObsidian: 'Progress sentinel'
      }
    }));

    const { resolveStatusMessage, resolveSupportPromptMessages } =
      await import('../../../src/content/ui/supportPromptMessages');
    const messages = await resolveSupportPromptMessages(document);
    const resolved = resolveStatusMessage({
      status: 'progress',
      messages,
      runtimeMessages: undefined
    });

    expect(messages.dialogLabel).toBe('Dialog sentinel');
    expect(messages.title).toBe('Title sentinel');
    expect(resolved.text).toBe('Progress sentinel');
  });

  it('prefers descriptor-based failure copy over legacy error strings', async () => {
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({
      status: 'failure',
      error: {
        code: 'LOCAL_VAULT_WRITE_FAILED',
        message: 'Local vault write failed: Articles/test.md',
        userMessageDescriptor: {
          key: 'localVaultWriteFailed',
          values: { folderName: 'Main' }
        },
        severity: ErrorSeverity.ERROR,
        domain: 'background',
        recoverable: true,
        timestamp: Date.now(),
        context: { contextMessage: 'disk full' }
      }
    });

    const shadow = getPromptHost().shadowRoot;
    const statusText = shadow?.querySelector('[data-role="status-text"]')?.textContent ?? '';
    expect(statusText).toContain('Failed to write to the local folder: Main');
    expect(statusText).toContain('(code: LOCAL_VAULT_WRITE_FAILED)');
    expect(statusText).not.toMatch(/[\u3400-\u9fff]/u);
    expect(shadow?.querySelector('[data-role="status-detail"]')?.textContent).toBe('disk full');
  });

  it('renders shared rest errors through descriptor-based failure copy', async () => {
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    const error = restErrors.requestFailed('Failed to fetch', { endpoint: 'https://api.example' });
    await prompt.show({
      status: 'failure',
      error
    });

    const shadow = getPromptHost().shadowRoot;
    const statusText = shadow?.querySelector('[data-role="status-text"]')?.textContent ?? '';
    expect(statusText).toContain(
      'Request failed. We will retry shortly, or check the network and try again.'
    );
    expect(statusText).toContain('(code: REST_NETWORK_REQUEST_FAILED)');
    expect(statusText).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it('uses generic failure copy when descriptor exists but runtime messages are unavailable', async () => {
    const { resolveStatusMessage, resolveSupportPromptMessages } =
      await import('../../../src/content/ui/supportPromptMessages');
    const messages = await resolveSupportPromptMessages(document);
    const technicalMessage = 'Local vault write failed: Articles/test.md';

    const statusMessage = resolveStatusMessage({
      status: 'failure',
      reason: technicalMessage,
      messages,
      error: {
        code: 'LOCAL_VAULT_WRITE_FAILED',
        message: technicalMessage,
        userMessageDescriptor: {
          key: 'localVaultWriteFailed',
          values: { folderName: 'Main' }
        },
        severity: ErrorSeverity.ERROR,
        domain: 'background',
        recoverable: true,
        timestamp: Date.now()
      }
    });

    expect(statusMessage.text).toBe('Failed');
    expect(statusMessage.text).not.toContain(technicalMessage);
    expect(statusMessage.text).not.toContain('Failed to write to the local folder: Main');
    expect(statusMessage.text).not.toMatch(/[\u3400-\u9fff]/u);
  });

  it('shows like toast and review actions', async () => {
    storageLocalGetMock.mockResolvedValue({ hasClickedReview: true });
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'success' });

    const shadow = getPromptHost().shadowRoot;
    if (!shadow) {
      throw new Error('support prompt shadow missing');
    }
    shadow.querySelector<HTMLButtonElement>('[data-role="like-btn"]')?.click();
    await flushMicrotasks();

    expect(document.getElementById('aiob-support-prompt')).toBeNull();
    const toastShadow = getToastShadow();
    expect(toastShadow.querySelector('[data-role="like-toast-message"]')?.textContent).toBe(
      'Thanks!'
    );
    expect(toastShadow.querySelector('[data-role="review-link-btn"]')).toBeTruthy();
    expect(toastShadow.querySelector('[data-role="review-acknowledged-btn"]')).toBeTruthy();
    expect(messagingSendMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'support_like_clicked' })
    );
  });

  it('tracks support links with stable target ids instead of hrefs', async () => {
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'success' });

    const link = getPromptHost().shadowRoot?.querySelector<HTMLAnchorElement>(
      '.task-support-link[href*="ko-fi"]'
    );
    link?.click();
    await flushMicrotasks();

    expect(messagingSendMock).toHaveBeenCalledWith({
      type: 'ANALYTICS_EVENT',
      event: 'support_link_clicked',
      params: { target: 'ko-fi' }
    });
  });

  it('uses the content locale provider for review URLs when extension i18n is absent', async () => {
    getContentI18nResourceMock.mockReturnValue({
      language: 'ja',
      messages: null
    });
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'success' });

    getPromptHost().shadowRoot?.querySelector<HTMLButtonElement>('[data-role="like-btn"]')?.click();
    await flushMicrotasks();
    getToastShadow().querySelector<HTMLButtonElement>('[data-role="review-link-btn"]')?.click();
    await flushMicrotasks();

    expect(openSpy).toHaveBeenCalledWith(expect.stringContaining('hl=ja'), '_blank', 'noopener');
  });

  it('shows dislike toast with Reddit, GitHub, and Xiaohongshu feedback actions', async () => {
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'success' });

    getPromptHost()
      .shadowRoot?.querySelector<HTMLButtonElement>('[data-role="dislike-btn"]')
      ?.click();
    await flushMicrotasks();

    const toastShadow = getToastShadow();
    const redditLink = toastShadow.querySelector<HTMLAnchorElement>('[data-role="reddit-link"]');
    expect(redditLink?.textContent).toBe('Reddit');
    expect(toastShadow.querySelector('[data-role="github-link"]')).toBeTruthy();
    const xiaohongshuButton = toastShadow.querySelector<HTMLButtonElement>(
      '[data-role="xiaohongshu-feedback-btn"]'
    );
    expect(xiaohongshuButton?.tagName).toBe('BUTTON');
    expect(xiaohongshuButton?.textContent).toBe('小红书');

    xiaohongshuButton?.click();
    await flushMicrotasks();

    const qrToast = getToastShadow().querySelector<HTMLElement>('.support-prompt-toast.reward-qr');
    expect(qrToast).toBeTruthy();
    expect(qrToast?.classList.contains('reward-qr--xiaohongshu')).toBe(true);
    expect(
      qrToast?.querySelector<HTMLElement>('[data-role="xiaohongshu-feedback-qr-caption"]')
        ?.textContent
    ).toBe('使用小红书扫码入群');
    expect(
      qrToast
        ?.querySelector<HTMLImageElement>('[data-role="xiaohongshu-feedback-qr-image"]')
        ?.getAttribute('src')
    ).toBe('https://sxnian.com/products/zendio/xiaohongshu-feedback.jpg');
  });

  it('dismisses support toasts from outside pointerdown', async () => {
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'success' });

    getPromptHost().shadowRoot?.querySelector<HTMLButtonElement>('[data-role="like-btn"]')?.click();
    await flushMicrotasks();

    const toastShadow = getToastShadow();
    const toast = toastShadow.querySelector<HTMLElement>('#aiob-support-toast');
    expect(toast).toBeTruthy();

    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(toast?.classList.contains('is-visible')).toBe(false);

    toast?.dispatchEvent(new Event('transitionend'));
    expect(document.getElementById('aiob-support-toast-host')).toBeNull();
  });

  it('closes from the Stitch overlay action', async () => {
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'success' });

    getPromptHost()
      .shadowRoot?.querySelector<HTMLDivElement>('.resource-modal-overlay')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('aiob-support-prompt')).toBeNull();
  });

  it('replays Stitch runtime styles after async load on first toast render', async () => {
    const stitchDeferred = createDeferred<string>();
    const stitchSecondaryDeferred = createDeferred<string>();
    loadExtensionStyleMock.mockImplementation((path: string) => {
      if (path === 'options/stitch/styles/stitch.css') {
        return stitchDeferred.promise;
      }
      if (path === 'options/stitch/styles/variants/stitch-secondary.css') {
        return stitchSecondaryDeferred.promise;
      }
      return Promise.resolve('');
    });

    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'success' });

    getPromptHost().shadowRoot?.querySelector<HTMLButtonElement>('[data-role="like-btn"]')?.click();
    await flushMicrotasks();

    const toastShadow = getToastShadow();
    expect(
      toastShadow.querySelector('style[data-aiob-style-bridge="panel-stitch-runtime"]')
        ?.textContent ?? ''
    ).toBe('');
    expect(
      toastShadow.querySelector('style[data-aiob-style-bridge="panel-clipper-tailwind"]')
    ).toBeNull();

    stitchDeferred.resolve('.stitch-ready{opacity:1;}');
    stitchSecondaryDeferred.resolve('.stitch-secondary-ready{opacity:1;}');
    await flushMicrotasks();
    await flushMicrotasks();

    expect(
      toastShadow.querySelector('style[data-aiob-style-bridge="panel-stitch-runtime"]')?.textContent
    ).toContain('.stitch-ready');
    expect(
      toastShadow.querySelector('style[data-aiob-style-bridge="panel-stitch-secondary-runtime"]')
        ?.textContent
    ).toContain('.stitch-secondary-ready');
  });
});
