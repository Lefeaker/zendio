import { isExactSessionDraftStorageKey } from '../../shared/sessionDrafts';

export interface SessionDraftLeaseOwnership {
  key: string;
  leaseId: string;
  mode: 'reader' | 'video';
  generation: number;
}

export interface SessionDraftLeaseOwnerRegistry {
  replace(ownership: SessionDraftLeaseOwnership): void;
  remove(key: string, generation?: number): void;
  clear(): void;
  owns(key: string, leaseId: string): boolean;
}

export function createSessionDraftLeaseOwnerRegistry(): SessionDraftLeaseOwnerRegistry {
  const entries = new Map<string, SessionDraftLeaseOwnership>();
  return {
    replace(ownership) {
      if (
        !isExactSessionDraftStorageKey(ownership.key) ||
        ownership.leaseId.length === 0 ||
        !Number.isSafeInteger(ownership.generation) ||
        ownership.generation < 0
      ) {
        throw new Error('SESSION_DRAFT_LEASE_OWNERSHIP_INVALID');
      }
      entries.set(ownership.key, { ...ownership });
    },
    remove(key, generation) {
      const current = entries.get(key);
      if (!current || (generation !== undefined && current.generation !== generation)) return;
      entries.delete(key);
    },
    clear() {
      entries.clear();
    },
    owns(key, leaseId) {
      const current = entries.get(key);
      return current?.leaseId === leaseId;
    }
  };
}
