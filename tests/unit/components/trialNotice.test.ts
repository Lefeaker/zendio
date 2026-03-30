/* @vitest-environment jsdom */

import { beforeEach, describe, expect, it, vi } from 'vitest';

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
    document.body.innerHTML = '';
    document.head.innerHTML = '';
    vi.useFakeTimers();
  });

  it('renders notice for active trial and shows modal details', async () => {
    checkTrialStatusMock.mockResolvedValue({
      isTrial: true,
      isExpired: false,
      remainingDays: 1,
      remainingHours: 1,
      expirationDate: new Date('2026-03-10T00:00:00Z'),
      isExpiringSoon: true
    });
    const { TrialNotice } = await import('../../../src/components/trial-notice');
    const notice = new TrialNotice();
    await notice.initialize();

    const element = document.querySelector('.trial-notice');
    expect(element?.textContent).toContain('试用版即将过期');
    (element as HTMLElement).click();
    expect(document.body.textContent).toContain('试用版信息');
    (document.getElementById('trial-close-btn') as HTMLButtonElement).click();
    expect(document.getElementById('trial-close-btn')).toBeNull();
    notice.destroy();
  });

  it('adds blink effect for expired status and refreshes content', async () => {
    checkTrialStatusMock.mockResolvedValueOnce({
      isTrial: true,
      isExpired: true,
      remainingDays: 0,
      remainingHours: 0,
      expirationDate: new Date('2026-03-08T00:00:00Z'),
      isExpiringSoon: false
    }).mockResolvedValueOnce({
      isTrial: true,
      isExpired: true,
      remainingDays: 0,
      remainingHours: 0,
      expirationDate: new Date('2026-03-08T00:00:00Z'),
      isExpiringSoon: false
    });

    const { TrialNotice, initializeTrialNotice, getTrialNotice } = await import('../../../src/components/trial-notice');
    const notice = new TrialNotice();
    await notice.initialize();
    const noticeElement = document.querySelector('.trial-notice');
    if (!(noticeElement instanceof HTMLElement)) throw new Error('notice missing');
    expect(noticeElement.style.animation).toContain('trial-blink');
    await notice.refresh();
    await initializeTrialNotice();
    expect(getTrialNotice()).not.toBeNull();
    notice.destroy();
  });
});
