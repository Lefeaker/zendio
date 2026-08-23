import { describe, expect, it, vi } from 'vitest';

import { createSessionDraftOwnerLivenessProbe } from '../../../src/background/services/sessionDraftOwnerLivenessProbe';
import { TabsBoundaryError } from '../../../src/platform/interfaces/tabs';
import {
  createSessionDraftPageKey,
  createSessionDraftStorageKey
} from '../../../src/shared/sessionDrafts';
import type { TabsService } from '../../../src/platform/interfaces/tabs';
import { asType } from '../../utils/typeHelpers';

const key = createSessionDraftStorageKey({
  mode: 'reader',
  pageKey: createSessionDraftPageKey('reader', 'https://example.com/article'),
  draftId: 'draft-1'
});
const target = {
  kind: 'leased-v2',
  key,
  leaseId: 'lease-1',
  owner: { tabId: 7, frameId: 2, windowId: 4 }
} satisfies Parameters<ReturnType<typeof createSessionDraftOwnerLivenessProbe>>[0];

function createTab(id: number, windowId = 9): chrome.tabs.Tab {
  return {
    id,
    index: 0,
    windowId,
    highlighted: false,
    active: true,
    pinned: false,
    incognito: false,
    selected: true,
    discarded: false,
    autoDiscardable: true,
    frozen: false,
    groupId: -1
  };
}

describe('session draft owner liveness probe', () => {
  it('requires an exact nonce-bound response from the trusted tab and frame', async () => {
    const tabs: Pick<TabsService, 'get' | 'sendMessage'> = {
      get: vi.fn(() => Promise.resolve(createTab(7))),
      sendMessage: asType<TabsService['sendMessage']>(
        vi.fn((_tabId: number, request: { probeId: string }) =>
          Promise.resolve({ probeId: request.probeId, active: true })
        )
      )
    };
    const probe = createSessionDraftOwnerLivenessProbe(tabs, {
      createProbeId: () => 'probe-1'
    });
    await expect(probe(target)).resolves.toBe('active');
    expect(tabs.sendMessage).toHaveBeenCalledWith(
      7,
      expect.objectContaining({ probeId: 'probe-1', key, leaseId: 'lease-1' }),
      { frameId: 2 }
    );
  });

  it('treats only typed missing-tab/no-receiver boundaries as inactive', async () => {
    const missing = createSessionDraftOwnerLivenessProbe({
      get: () => Promise.reject(new TabsBoundaryError('TAB_NOT_FOUND')),
      sendMessage: vi.fn()
    });
    await expect(missing(target)).resolves.toBe('inactive');

    const noReceiver = createSessionDraftOwnerLivenessProbe({
      get: () => Promise.resolve(createTab(7)),
      sendMessage: () => Promise.reject(new TabsBoundaryError('NO_RECEIVER'))
    });
    await expect(noReceiver(target)).resolves.toBe('inactive');

    const unknown = createSessionDraftOwnerLivenessProbe({
      get: () => Promise.resolve(createTab(7)),
      sendMessage: () => Promise.reject(new Error('unexpected'))
    });
    await expect(unknown(target)).rejects.toThrow('unexpected');
  });

  it('rejects malformed or nonce-mismatched responses', async () => {
    const probe = createSessionDraftOwnerLivenessProbe(
      {
        get: () => Promise.resolve(createTab(7)),
        sendMessage: asType<TabsService['sendMessage']>(() =>
          Promise.resolve({ probeId: 'wrong', active: true })
        )
      },
      { createProbeId: () => 'expected' }
    );
    await expect(probe(target)).rejects.toThrow('SESSION_DRAFT_OWNER_PROBE_RESPONSE_INVALID');
  });
});
