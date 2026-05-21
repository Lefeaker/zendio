/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorSeverity } from '@shared/errors/types';

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

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
const getContentI18nResourceMock = vi.hoisted(() => vi.fn(() => ({ messages: null })));
const getContentMessagesMock = vi.hoisted(() =>
  vi.fn(() =>
    Promise.resolve({
      supportPromptDialogLabel: 'Support All in Ob',
      supportPromptTitle: 'Support All in Ob',
      supportPromptKoFiTitle: 'Ko-fi',
      supportPromptKoFiDescription: 'Buy me a coffee',
      supportPromptAfdianTitle: 'Afdian',
      supportPromptAfdianDescription: 'CN sponsor',
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
      supportPromptLikeThankYou: 'Thanks!',
      supportPromptReviewLinkLabel: 'Write review',
      supportPromptReviewAcknowledgedLabel: 'I already reviewed',
      supportPromptDislikeToastTitle: 'Share feedback',
      supportPromptDislikeRedditLinkLabel: 'Discuss on Reddit',
      supportPromptDislikeQrLinkLabel: 'Join Xiaohongshu',
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
    storageLocalGetMock.mockResolvedValue({});
    storageLocalSetMock.mockResolvedValue(undefined);
    messagingSendMock.mockResolvedValue(undefined);
    loadExtensionStyleMock.mockImplementation((path: string) =>
      Promise.resolve(`/* ${path} */ .stitch-runtime{display:block;}`)
    );
  });

  it('renders success state with Stitch task-success content', async () => {
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'success', vaultName: 'Main Vault' });

    const shadow = getPromptHost().shadowRoot;
    expect(shadow?.querySelector('[data-role="like-btn"]')).toBeTruthy();
    expect(shadow?.querySelector('[data-role="dislike-btn"]')).toBeTruthy();
    expect(shadow?.querySelectorAll('.task-support-link[href]').length).toBe(2);
    expect(shadow?.querySelector('[data-role="status-text"]')?.textContent).toContain(
      'Sent to Main Vault'
    );
    expect(shadow?.querySelector('[data-role="dismiss-text"]')?.textContent).toBe(
      'Click outside to close'
    );
  });

  it('renders an in-flight progress strip before the support links', async () => {
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({
      status: 'progress',
      progress: { value: 42, label: '正在写入笔记' }
    });

    const shadow = getPromptHost().shadowRoot;
    const header = shadow?.querySelector('.task-success-header');
    const progress = shadow?.querySelector<HTMLElement>('[data-role="task-progress"]');
    const supportStrip = shadow?.querySelector('.task-support-strip');

    expect(shadow?.querySelector('[data-role="status-text"]')?.textContent).toBe('正在写入笔记');
    expect(progress).toBeTruthy();
    expect(progress?.style.getPropertyValue('--task-progress-value')).toBe('42%');
    expect(progress?.classList.contains('is-progress')).toBe(true);
    expect(header?.compareDocumentPosition(progress as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
    expect(progress?.compareDocumentPosition(supportStrip as Node)).toBe(
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

  it('auto-dismisses terminal progress prompts after completion', async () => {
    vi.useFakeTimers();
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({
      status: 'success',
      progress: { value: 100, label: '成功发送到 Obsidian', variant: 'success' }
    });

    expect(document.getElementById('aiob-support-prompt')).toBeTruthy();
    await vi.advanceTimersByTimeAsync(2400);

    expect(document.getElementById('aiob-support-prompt')).toBeNull();
    vi.useRealTimers();
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
    expect(shadow?.querySelector('[data-role="status-detail"]')?.textContent).toBe('extra detail');
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

  it('shows dislike toast with Reddit and GitHub feedback actions', async () => {
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'success' });

    getPromptHost()
      .shadowRoot?.querySelector<HTMLButtonElement>('[data-role="dislike-btn"]')
      ?.click();
    await flushMicrotasks();

    const toastShadow = getToastShadow();
    expect(toastShadow.querySelector('[data-role="qr-container"]')).toBeNull();
    expect(toastShadow.querySelector('[data-role="qr-toggle-btn"]')).toBeNull();
    expect(toastShadow.querySelector('[data-role="reddit-link"]')).toBeTruthy();
    expect(toastShadow.querySelector('[data-role="github-link"]')).toBeTruthy();
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
