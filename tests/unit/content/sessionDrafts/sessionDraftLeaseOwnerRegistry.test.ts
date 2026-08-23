import { describe, expect, it } from 'vitest';

import { createSessionDraftLeaseOwnerRegistry } from '../../../../src/content/sessionDrafts/sessionDraftLeaseOwnerRegistry';
import {
  createSessionDraftPageKey,
  createSessionDraftStorageKey
} from '../../../../src/shared/sessionDrafts';

const key = createSessionDraftStorageKey({
  mode: 'reader',
  pageKey: createSessionDraftPageKey('reader', 'https://example.com/article'),
  draftId: 'draft-1'
});

describe('session draft lease owner registry', () => {
  it('matches only the current exact key and opaque lease generation', () => {
    const registry = createSessionDraftLeaseOwnerRegistry();
    registry.replace({ key, leaseId: 'lease-1', mode: 'reader', generation: 1 });
    expect(registry.owns(key, 'lease-1')).toBe(true);
    expect(registry.owns(key, 'lease-2')).toBe(false);

    registry.replace({ key, leaseId: 'lease-2', mode: 'reader', generation: 2 });
    registry.remove(key, 1);
    expect(registry.owns(key, 'lease-2')).toBe(true);
    registry.remove(key, 2);
    expect(registry.owns(key, 'lease-2')).toBe(false);
  });

  it('rejects non-exact keys and invalid generations', () => {
    const registry = createSessionDraftLeaseOwnerRegistry();
    expect(() =>
      registry.replace({ key: 'draft-1', leaseId: 'lease-1', mode: 'reader', generation: 0 })
    ).toThrow('SESSION_DRAFT_LEASE_OWNERSHIP_INVALID');
    expect(() =>
      registry.replace({ key, leaseId: 'lease-1', mode: 'reader', generation: -1 })
    ).toThrow('SESSION_DRAFT_LEASE_OWNERSHIP_INVALID');
  });
});
