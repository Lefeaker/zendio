/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTestPlatformHarness } from '../../utils/platformTestHarness';

const checkTrialStatusMock = vi.hoisted(() => vi.fn());
const formatRemainingTimeMock = vi.hoisted(() => vi.fn(() => '1 hour'));

vi.mock('../../../src/utils/trial-manager.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/utils/trial-manager.js')>();
  return {
    ...actual,
    checkTrialStatus: checkTrialStatusMock,
    formatRemainingTime: formatRemainingTimeMock
  };
});

const harness = createTestPlatformHarness();
const CJK_REGEX = /[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/u;

describe('TrialNotice', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    harness.configure();
    formatRemainingTimeMock.mockReturnValue('1 hour');
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    harness.reset();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function setLanguage(language: 'en' | 'zh-CN') {
    const { configureI18nRuntimeLanguageProvider, configureI18nStorage, setCurrentLanguage } =
      await import('../../../src/i18n');
    configureI18nRuntimeLanguageProvider(null);
    configureI18nStorage(harness.storage.sync);
    await setCurrentLanguage(language);
  }

  function trialStatus(overrides: Partial<Awaited<ReturnType<typeof checkTrialStatusMock>>> = {}) {
    return {
      isTrial: true,
      isExpired: false,
      remainingDays: 1,
      remainingHours: 1,
      expirationDate: new Date('2026-03-10T12:00:00Z'),
      isExpiringSoon: false,
      ...overrides
    };
  }

  async function mountNotice() {
    const { TrialNotice } = await import('../../../src/components/trial-notice');
    const notice = new TrialNotice();
    await notice.initialize();
    const element = document.querySelector('.trial-notice');
    if (!(element instanceof HTMLElement)) {
      throw new Error('trial notice missing');
    }
    return { notice, element };
  }

  it.each([
    {
      name: 'active',
      status: trialStatus(),
      detail: '1 hour',
      expected: ['Trial', '1 hour']
    },
    {
      name: 'expiring',
      status: trialStatus({ isExpiringSoon: true }),
      detail: '1 hour',
      expected: ['Trial expiring soon', '1 hour']
    },
    {
      name: 'expired',
      status: trialStatus({
        isExpired: true,
        remainingDays: 0,
        remainingHours: 0,
        expirationDate: new Date('2026-03-08T12:00:00Z')
      }),
      detail: '1 hour',
      expected: ['Trial expired', 'March']
    }
  ])('renders English $name notices without CJK', async ({ status, detail, expected }) => {
    await setLanguage('en');
    formatRemainingTimeMock.mockReturnValue(detail);
    checkTrialStatusMock.mockResolvedValue(status);
    const { notice, element } = await mountNotice();

    expected.forEach((text) => expect(element.textContent).toContain(text));
    expect(element.textContent ?? '').not.toMatch(CJK_REGEX);
    notice.destroy();
  });

  it('renders zh-CN catalog-backed notice and modal copy', async () => {
    await setLanguage('zh-CN');
    formatRemainingTimeMock.mockReturnValue('1 小时');
    checkTrialStatusMock.mockResolvedValue(trialStatus({ isExpiringSoon: true }));

    const { notice, element } = await mountNotice();

    expect(element.textContent).toContain('试用版即将过期');
    expect(element.textContent).toContain('1 小时');

    element.click();

    expect(document.body.textContent).toContain('试用版即将过期');
    expect(document.body.textContent).toContain('试用版本 - 1小时');
    expect(document.body.textContent).toContain('试用版将在 1 小时 后过期，请及时联系开发者。');
    expect(document.body.textContent).toContain('好的');
    notice.destroy();
  });

  it('opens modal details and removes them through close button and backdrop clicks', async () => {
    await setLanguage('en');
    checkTrialStatusMock.mockResolvedValue(trialStatus({ isExpiringSoon: true }));
    const { notice, element } = await mountNotice();

    element.click();
    expect(document.body.textContent).toContain('Trial expiring soon');
    const closeButton = document.getElementById('trial-close-btn');
    if (!(closeButton instanceof HTMLButtonElement)) {
      throw new Error('trial modal close button missing');
    }
    closeButton.click();
    expect(document.getElementById('trial-close-btn')).toBeNull();

    element.click();
    const modal = document.body.lastElementChild;
    if (!(modal instanceof HTMLElement)) {
      throw new Error('trial modal backdrop missing');
    }
    modal.click();
    expect(document.getElementById('trial-close-btn')).toBeNull();

    notice.destroy();
  });

  it('initializeTrialNotice destroys a previous global instance before creating a new one', async () => {
    await setLanguage('en');
    checkTrialStatusMock
      .mockResolvedValueOnce(trialStatus({ remainingHours: 2 }))
      .mockResolvedValueOnce(trialStatus({ remainingHours: 1, isExpiringSoon: true }));
    formatRemainingTimeMock.mockReturnValueOnce('2 hours').mockReturnValueOnce('1 hour');

    const { initializeTrialNotice, getTrialNotice } =
      await import('../../../src/components/trial-notice');
    await initializeTrialNotice();
    const firstNotice = getTrialNotice();
    await initializeTrialNotice();

    expect(getTrialNotice()).not.toBe(firstNotice);
    expect(document.querySelectorAll('.trial-notice')).toHaveLength(1);
    expect(document.body.textContent).not.toContain('2 hours');
    expect(document.body.textContent).toContain('1 hour');
    getTrialNotice()?.destroy();
  });

  it('destroy removes notice, clears interval, and removes TrialNotice blink styles', async () => {
    await setLanguage('en');
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    checkTrialStatusMock.mockResolvedValue(
      trialStatus({
        isExpired: true,
        remainingDays: 0,
        remainingHours: 0,
        expirationDate: new Date('2026-03-08T12:00:00Z')
      })
    );
    const { notice } = await mountNotice();

    expect(document.querySelector('.trial-notice')).not.toBeNull();
    expect(document.querySelector('.trial-notice--expired')).not.toBeNull();
    const ownedStyles = document.querySelectorAll('style[data-trial-notice-style="base"]');
    expect(ownedStyles).toHaveLength(1);
    expect(ownedStyles[0]?.textContent).toContain('@keyframes trial-blink');

    notice.destroy();

    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
    expect(document.querySelector('.trial-notice')).toBeNull();
    expect(document.querySelector('style[data-trial-notice-style]')).toBeNull();
  });

  it('does not inject duplicate blink styles after repeated expired refreshes', async () => {
    await setLanguage('en');
    checkTrialStatusMock
      .mockResolvedValueOnce(trialStatus({ isExpiringSoon: true }))
      .mockResolvedValueOnce(
        trialStatus({
          isExpired: true,
          remainingDays: 0,
          remainingHours: 0,
          expirationDate: new Date('2026-03-08T12:00:00Z')
        })
      )
      .mockResolvedValueOnce(
        trialStatus({
          isExpired: true,
          remainingDays: 0,
          remainingHours: 0,
          expirationDate: new Date('2026-03-08T12:00:00Z')
        })
      );
    const { notice } = await mountNotice();

    await notice.refresh();
    await notice.refresh();

    expect(document.querySelector('.trial-notice--expired')).not.toBeNull();
    expect(document.querySelectorAll('style[data-trial-notice-style="base"]')).toHaveLength(1);
    notice.destroy();
  });

  it('inserts formatted time text without parsing markup', async () => {
    await setLanguage('en');
    formatRemainingTimeMock.mockReturnValue('<img src=x onerror=alert(1)>1 hour');
    checkTrialStatusMock.mockResolvedValue(trialStatus());
    const { notice, element } = await mountNotice();

    expect(element.textContent).toContain('<img src=x onerror=alert(1)>1 hour');
    expect(element.querySelector('img')).toBeNull();

    element.click();
    expect(document.body.textContent).toContain('<img src=x onerror=alert(1)>1 hour');
    expect(document.body.querySelector('img')).toBeNull();
    notice.destroy();
  });
});
