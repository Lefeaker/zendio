import type {
  SessionDraftEnvelope,
  SessionDraftFinalizeExactRequest,
  SessionDraftRemoveExactRequest,
  SessionDraftTerminalStatus
} from '../../shared/sessionDrafts';
import type { FinalizeTerminalSessionDraftResult } from './sessionDraftTerminal';

export interface SessionDraftTerminalTarget {
  key: string;
  status: SessionDraftTerminalStatus;
  envelope?: SessionDraftEnvelope;
  finalizeRequest?: SessionDraftFinalizeExactRequest;
  removeRequest?: SessionDraftRemoveExactRequest;
  committed?: SessionDraftEnvelope;
  removed: boolean;
}

/** Owned by one mounted session; retries retain the original mutation identities. */
export interface SessionDraftTerminalState {
  targets: SessionDraftTerminalTarget[] | null;
  finalizedEnvelopes: SessionDraftEnvelope[];
  completed: boolean;
  inFlight: Promise<FinalizeTerminalSessionDraftResult> | null;
}

export function createSessionDraftTerminalState(): SessionDraftTerminalState {
  return { targets: null, finalizedEnvelopes: [], completed: false, inFlight: null };
}
