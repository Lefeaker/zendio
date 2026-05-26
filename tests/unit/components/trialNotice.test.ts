/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const checkTrialStatusMock = vi.hoisted(() => vi.fn());
const formatRemainingTimeMock = vi.hoisted(() => vi.fn(() => '剩余 1 小时'));

vi.mock('../../../src/utils/trial-manager.js', () => ({
  checkTrialStatus: checkTrialStatusMock,
  formatRemainingTime: formatRemainingTimeMock
}));

describe('TrialNotice', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    formatRemainingTimeMock.mockReturnValue('剩余 1 小时');
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function trialStatus(overrides: Partial<Awaited<ReturnType<typeof checkTrialStatusMock>>> = {}) {
    return {
      isTrial: true,
      isExpired: false,
      remainingDays: 1,
      remainingHours: 1,
      expirationDate: new Date('2026-03-10T00:00:00Z'),
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
      expected: ['试用版', '剩余 1 小时']
    },
    {
      name: 'expiring',
      status: trialStatus({ isExpiringSoon: true }),
      expected: ['试用版即将过期', '剩余 1 小时']
    },
    {
      name: 'expired',
      status: trialStatus({
        isExpired: true,
        remainingDays: 0,
        remainingHours: 0,
        expirationDate: new Date('2026-03-08T00:00:00Z')
      }),
      expected: ['试用版已过期', '点击查看详情']
    }
  ])('renders the same visible status text for $name notices', async ({ status, expected }) => {
    checkTrialStatusMock.mockResolvedValue(status);
    const { notice, element } = await mountNotice();

    expected.forEach((text) => expect(element.textContent).toContain(text));
    notice.destroy();
  });

  it('opens modal details and removes them through close button and backdrop clicks', async () => {
    checkTrialStatusMock.mockResolvedValue(trialStatus({ isExpiringSoon: true }));
    const { notice, element } = await mountNotice();

    element.click();
    expect(document.body.textContent).toContain('试用版信息');
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
    checkTrialStatusMock
      .mockResolvedValueOnce(trialStatus({ remainingHours: 2 }))
      .mockResolvedValueOnce(trialStatus({ remainingHours: 1, isExpiringSoon: true }));
    formatRemainingTimeMock.mockReturnValueOnce('剩余 2 小时').mockReturnValueOnce('剩余 1 小时');

    const { initializeTrialNotice, getTrialNotice } =
      await import('../../../src/components/trial-notice');
    await initializeTrialNotice();
    const firstNotice = getTrialNotice();
    await initializeTrialNotice();

    expect(getTrialNotice()).not.toBe(firstNotice);
    expect(document.querySelectorAll('.trial-notice')).toHaveLength(1);
    expect(document.body.textContent).not.toContain('剩余 2 小时');
    expect(document.body.textContent).toContain('剩余 1 小时');
    getTrialNotice()?.destroy();
  });

  it('destroy removes notice, clears interval, and removes TrialNotice blink styles', async () => {
    const clearIntervalSpy = vi.spyOn(window, 'clearInterval');
    checkTrialStatusMock.mockResolvedValue(
      trialStatus({
        isExpired: true,
        remainingDays: 0,
        remainingHours: 0,
        expirationDate: new Date('2026-03-08T00:00:00Z')
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
    checkTrialStatusMock
      .mockResolvedValueOnce(trialStatus({ isExpiringSoon: true }))
      .mockResolvedValueOnce(
        trialStatus({
          isExpired: true,
          remainingDays: 0,
          remainingHours: 0,
          expirationDate: new Date('2026-03-08T00:00:00Z')
        })
      )
      .mockResolvedValueOnce(
        trialStatus({
          isExpired: true,
          remainingDays: 0,
          remainingHours: 0,
          expirationDate: new Date('2026-03-08T00:00:00Z')
        })
      );
    const { notice } = await mountNotice();

    await notice.refresh();
    await notice.refresh();

    expect(document.querySelector('.trial-notice--expired')).not.toBeNull();
    expect(document.querySelectorAll('style[data-trial-notice-style="base"]')).toHaveLength(1);
    notice.destroy();
  });

  it('inserts formatted time and expiration text without parsing markup', async () => {
    formatRemainingTimeMock.mockReturnValue('<img src=x onerror=alert(1)>剩余');
    checkTrialStatusMock.mockResolvedValue(
      trialStatus({
        expirationDate: {
          toLocaleString: () => '<svg onload=alert(2)>2026'
        }
      })
    );
    const { notice, element } = await mountNotice();

    expect(element.textContent).toContain('<img src=x onerror=alert(1)>剩余');
    expect(element.querySelector('img')).toBeNull();

    element.click();
    expect(document.body.textContent).toContain('<img src=x onerror=alert(1)>剩余');
    expect(document.body.textContent).toContain('<svg onload=alert(2)>2026');
    expect(document.body.querySelector('img, svg')).toBeNull();
    notice.destroy();
  });
});
