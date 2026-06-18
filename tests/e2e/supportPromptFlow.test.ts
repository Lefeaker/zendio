/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

const flushMicrotasks = () => new Promise((resolve) => setTimeout(resolve, 0));

vi.mock('focus-trap', () => ({
  createFocusTrap: () => ({
    activate: vi.fn(),
    deactivate: vi.fn(),
    pause: vi.fn(),
    unpause: vi.fn()
  })
}));

const loadExtensionStyleMock = vi.hoisted(() =>
  vi.fn<(...args: [string]) => Promise<string>>(() => Promise.resolve('.prompt{}'))
);
vi.mock('../../src/content/clipper/shared/styleRegistry', () => ({
  loadExtensionStyle: loadExtensionStyleMock
}));

const ensureContentI18nMock = vi.hoisted(() => vi.fn(() => Promise.resolve()));
const getContentI18nResourceMock = vi.hoisted(() => vi.fn(() => ({ messages: null })));
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
vi.mock('../../src/content/i18n/context', () => ({
  ensureContentI18n: ensureContentI18nMock,
  getContentI18nResource: getContentI18nResourceMock,
  getContentMessages: getContentMessagesMock
}));

const storageState = { hasClickedReview: false, hasConfirmedReview: false };
const storageLocalGetMock = vi.hoisted(() => vi.fn(() => Promise.resolve({ ...storageState })));
const storageLocalSetMock = vi.hoisted(() =>
  vi.fn((_key: string, value: typeof storageState) => {
    Object.assign(storageState, value);
    return Promise.resolve(undefined);
  })
);
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
vi.mock('../../src/shared/di', async () => {
  const actual = await vi.importActual<typeof import('../../src/shared/di')>('../../src/shared/di');
  return {
    ...actual,
    getService: getServiceMock,
    resolveRepository: resolveRepositoryMock
  };
});

describe('support prompt flow', () => {
  function getToastRoot(): ShadowRoot | null {
    return document.getElementById('aiob-support-toast-host')?.shadowRoot ?? null;
  }

  beforeEach(() => {
    document.body.innerHTML = '';
    storageState.hasClickedReview = false;
    storageState.hasConfirmedReview = false;
    vi.clearAllMocks();
  });

  it('shows and closes prompt from the Stitch overlay action', async () => {
    const { SupportPrompt } = await import('../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'success' });
    expect(document.getElementById('aiob-support-prompt')).toBeTruthy();

    document
      .getElementById('aiob-support-prompt')
      ?.shadowRoot?.querySelector<HTMLDivElement>('.resource-modal-overlay')
      ?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(document.getElementById('aiob-support-prompt')).toBeNull();
  });

  it('shows like toast and review link flow', async () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const { SupportPrompt } = await import('../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'success' });
    document
      .getElementById('aiob-support-prompt')
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-role="like-btn"]')
      ?.click();
    await flushMicrotasks();
    getToastRoot()?.querySelector<HTMLButtonElement>('[data-role="review-link-btn"]')?.click();
    await flushMicrotasks();

    expect(storageLocalSetMock).toHaveBeenCalledWith(
      'support_prompt_review_state',
      expect.objectContaining({ hasClickedReview: true })
    );
    expect(openSpy).toHaveBeenCalled();
    openSpy.mockRestore();
  });

  it('acknowledges review and updates storage', async () => {
    storageState.hasClickedReview = true;
    const { SupportPrompt } = await import('../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'success' });
    document
      .getElementById('aiob-support-prompt')
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-role="like-btn"]')
      ?.click();
    await flushMicrotasks();
    getToastRoot()
      ?.querySelector<HTMLButtonElement>('[data-role="review-acknowledged-btn"]')
      ?.click();
    await flushMicrotasks();

    expect(storageLocalSetMock).toHaveBeenCalledWith(
      'support_prompt_review_state',
      expect.objectContaining({ hasClickedReview: true, hasConfirmedReview: true })
    );
  });

  it('shows dislike flow with Reddit, GitHub, and Xiaohongshu QR actions', async () => {
    const { SupportPrompt } = await import('../../src/content/ui/supportPrompt');
    const prompt = new SupportPrompt(document);
    await prompt.show({ status: 'success' });
    document
      .getElementById('aiob-support-prompt')
      ?.shadowRoot?.querySelector<HTMLButtonElement>('[data-role="dislike-btn"]')
      ?.click();
    await flushMicrotasks();

    const redditLink = getToastRoot()?.querySelector<HTMLAnchorElement>(
      '[data-role="reddit-link"]'
    );
    expect(redditLink?.textContent).toBe('Reddit');
    expect(getToastRoot()?.querySelector('[data-role="github-link"]')).toBeTruthy();

    const xiaohongshuButton = getToastRoot()?.querySelector<HTMLButtonElement>(
      '[data-role="xiaohongshu-feedback-btn"]'
    );
    expect(xiaohongshuButton?.tagName).toBe('BUTTON');
    xiaohongshuButton?.click();
    await flushMicrotasks();

    const qrToast = getToastRoot()?.querySelector<HTMLElement>('.support-prompt-toast.reward-qr');
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
    expect(messagingSendMock).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'support_dislike_clicked' })
    );
  });
});
