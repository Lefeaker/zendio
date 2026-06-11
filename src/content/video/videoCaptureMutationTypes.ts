import type { SessionMutationFailure, SessionMutationTransaction } from '@content/sessionDrafts';
import type { VideoHintState } from './videoHintManager';

export type VideoCaptureMutationFailure = SessionMutationFailure;

export type VideoCaptureMutationTransaction<Result> = SessionMutationTransaction<
  Result,
  VideoHintState | null
>;
