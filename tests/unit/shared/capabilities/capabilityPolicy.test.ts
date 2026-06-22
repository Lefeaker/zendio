import {
  DEFAULT_RESTORE_CAPABILITY_POLICY,
  createUnlimitedRestoreCapabilityPolicy
} from '../../../../src/shared/capabilities/capabilityPolicy';
import {
  FREE_SESSION_DRAFT_MAX_ITEMS_PER_PAGE,
  FREE_SESSION_DRAFT_MAX_RESTORABLE_PAGES,
  FREE_SESSION_DRAFT_RETENTION_MS
} from '../../../../src/content/sessionDrafts/sessionDraftRetentionPolicy';

describe('restore capability policy', () => {
  it('keeps the public default policy equal to current Free restore limits', () => {
    expect(DEFAULT_RESTORE_CAPABILITY_POLICY).toEqual({
      tier: 'free',
      retentionMs: FREE_SESSION_DRAFT_RETENTION_MS,
      maxRestorablePages: FREE_SESSION_DRAFT_MAX_RESTORABLE_PAGES,
      maxItemsPerPage: FREE_SESSION_DRAFT_MAX_ITEMS_PER_PAGE
    });
  });

  it('represents unlimited capability with null caps without changing retention duration', () => {
    expect(createUnlimitedRestoreCapabilityPolicy(FREE_SESSION_DRAFT_RETENTION_MS)).toEqual({
      tier: 'unlimited',
      retentionMs: FREE_SESSION_DRAFT_RETENTION_MS,
      maxRestorablePages: null,
      maxItemsPerPage: null
    });
  });
});
