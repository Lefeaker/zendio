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
  createFocusTrap: () => ({ activate: vi.fn(), deactivate: vi.fn(), pause: vi.fn(), unpause: vi.fn() })
}));

const loadClipperStyleMock = vi.hoisted(() => vi.fn((name: string) => Promise.resolve(`.${name}{display:block;}`)));
vi.mock('@content/clipper/shared/styleRegistry', () => ({
  loadClipperStyle: loadClipperStyleMock
}));

const ensureContentI18nMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const getContentI18nResourceMock = vi.hoisted(() => vi.fn(() => ({ messages: null })));
const getContentMessagesMock = vi.hoisted(() => vi.fn(() => Promise.resolve({
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
})));
vi.mock('@content/i18n/context', () => ({
  ensureContentI18n: ensureContentI18nMock,
  getContentI18nResource: getContentI18nResourceMock,
  getContentMessages: getContentMessagesMock
}));

const storageLocalGetMock = vi.hoisted(() => vi.fn(() => Promise.resolve({})));
const storageLocalSetMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const runtimeGetURLMock = vi.hoisted(() => vi.fn((path: string) => `chrome-extension://${path}`));
const messagingSendMock = vi.hoisted(() => vi.fn(() => Promise.resolve(undefined)));
const getServiceMock = vi.hoisted(() => vi.fn(() => ({
  storage: { local: { get: storageLocalGetMock, set: storageLocalSetMock }, sync: {}, session: {} },
  runtime: { getURL: runtimeGetURLMock }
})));
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
    loadClipperStyleMock.mockImplementation((name: string) => Promise.resolve(`.${name}{display:block;}`));
  });

  it('renders success state with Daisy dialog content', async () => {
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'success', vaultName: 'Main Vault' });

    const shadow = getPromptHost().shadowRoot;
    expect(shadow?.querySelector('[data-role="like-btn"]')).toBeTruthy();
    expect(shadow?.querySelector('[data-role="dislike-btn"]')).toBeTruthy();
    expect(shadow?.querySelectorAll('[data-role="support-link"]').length).toBe(3);
    expect(shadow?.querySelector('[data-role="status-text"]')?.textContent).toContain('Sent to Main Vault');
    expect(shadow?.querySelector('[data-role="dismiss-text"]')?.textContent).toBe('Click outside to close');
  });

  it('renders warning and failure details', async () => {
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'warning', errorMessage: 'classifier fallback' });
    let shadow = getPromptHost().shadowRoot;
    expect(shadow?.querySelector('[data-role="status-text"]')?.textContent).toContain('classifier fallback');

    prompt.hide();
    await prompt.show({
      status: 'failure',
      error: { code: 'FAIL_X', message: 'boom', userMessage: 'send failed', severity: ErrorSeverity.ERROR, domain: 'content', recoverable: true, timestamp: Date.now(), context: { contextMessage: 'extra detail' } }
    });
    shadow = getPromptHost().shadowRoot;
    expect(shadow?.querySelector('[data-role="status-text"]')?.textContent).toContain('send failed');
    expect(shadow?.querySelector('[data-role="status-detail"]')?.textContent).toBe('extra detail');
  });

  it('shows like toast and review actions', async () => {
    storageLocalGetMock.mockResolvedValue({ hasClickedReview: true });
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'success' });

    const shadow = getPromptHost().shadowRoot;
    shadow.querySelector<HTMLButtonElement>('[data-role="like-btn"]')?.click();
    await flushMicrotasks();

    expect(document.getElementById('aiob-support-prompt')).toBeNull();
    const toastShadow = getToastShadow();
    expect(toastShadow.querySelector('[data-role="like-toast-message"]')?.textContent).toBe('Thanks!');
    expect(toastShadow.querySelector('[data-role="review-link-btn"]')).toBeTruthy();
    expect(toastShadow.querySelector('[data-role="review-acknowledged-btn"]')).toBeTruthy();
    expect(messagingSendMock).toHaveBeenCalledWith(expect.objectContaining({ event: 'support_like_clicked' }));
  });

  it('shows dislike toast and toggles qr section', async () => {
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'success' });

    getPromptHost().shadowRoot?.querySelector<HTMLButtonElement>('[data-role="dislike-btn"]')?.click();
    await flushMicrotasks();

    const toastShadow = getToastShadow();
    const qr = toastShadow.querySelector<HTMLElement>('[data-role="qr-container"]');
    expect(qr).toBeTruthy();
    expect(qr?.hidden).toBe(true);
    toastShadow.querySelector<HTMLButtonElement>('[data-role="qr-toggle-btn"]')?.click();
    expect(qr?.hidden).toBe(false);
    expect(toastShadow.querySelector('[data-role="reddit-link"]')).toBeTruthy();
  });

  it('closes on backdrop click', async () => {
    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'success' });

    const overlay = getPromptHost().shadowRoot?.querySelector<HTMLDivElement>('.modal') ?? null;
    overlay?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('aiob-support-prompt')).toBeNull();
  });

  it('replays panel bridge styles after async load on first toast render', async () => {
    const clipperDeferred = createDeferred<string>();
    const videoDeferred = createDeferred<string>();
    loadClipperStyleMock.mockImplementation((name: string) => {
      if (name === 'clipper.tailwind') {
        return clipperDeferred.promise;
      }
      if (name === 'video.tailwind') {
        return videoDeferred.promise;
      }
      return Promise.resolve('');
    });

    const { SupportPrompt } = await import('../../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'success' });

    getPromptHost().shadowRoot?.querySelector<HTMLButtonElement>('[data-role="like-btn"]')?.click();
    await flushMicrotasks();

    const toastShadow = getToastShadow();
    expect(toastShadow.querySelector('style[data-aiob-style-bridge="panel-clipper-tailwind"]')?.textContent ?? '').toBe('');

    clipperDeferred.resolve('.clipper-ready{opacity:1;}');
    videoDeferred.resolve('.video-ready{opacity:1;}');
    await flushMicrotasks();
    await flushMicrotasks();

    expect(
      toastShadow.querySelector('style[data-aiob-style-bridge="panel-clipper-tailwind"]')?.textContent
    ).toContain('.clipper-ready');
  });
});
