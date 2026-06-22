export type RestorePolicyTier = 'free' | 'extended' | 'unlimited';

export interface RestoreCapabilityPolicy {
  tier: RestorePolicyTier;
  retentionMs: number;
  maxRestorablePages: number | null;
  maxItemsPerPage: number | null;
}

export const FREE_RESTORE_CAPABILITY_RETENTION_MS = 48 * 60 * 60 * 1000;
export const FREE_RESTORE_CAPABILITY_MAX_RESTORABLE_PAGES = 5;
export const FREE_RESTORE_CAPABILITY_MAX_ITEMS_PER_PAGE = 20;

export const DEFAULT_RESTORE_CAPABILITY_POLICY: RestoreCapabilityPolicy = {
  tier: 'free',
  retentionMs: FREE_RESTORE_CAPABILITY_RETENTION_MS,
  maxRestorablePages: FREE_RESTORE_CAPABILITY_MAX_RESTORABLE_PAGES,
  maxItemsPerPage: FREE_RESTORE_CAPABILITY_MAX_ITEMS_PER_PAGE
};

export function createUnlimitedRestoreCapabilityPolicy(
  retentionMs: number
): RestoreCapabilityPolicy {
  return {
    tier: 'unlimited',
    retentionMs,
    maxRestorablePages: null,
    maxItemsPerPage: null
  };
}
