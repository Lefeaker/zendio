import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import type {
  AutoSaveAttemptIdentity,
  OptionsControllerCallbacks,
  SaveReason
} from './optionsControllerTypes';

export function createSaveSuccessArguments(
  reason: SaveReason,
  saved: CompleteOptions | StoredOptions,
  identity: AutoSaveAttemptIdentity
): Parameters<NonNullable<OptionsControllerCallbacks['onSaveSuccess']>> {
  return reason === 'auto' ? [reason, saved, identity] : [reason, saved];
}

export class OptionsAutoSaveFailureTracker {
  private latest: AutoSaveAttemptIdentity | null = null;

  record(identity: AutoSaveAttemptIdentity): void {
    if (!this.latest || identity.admissionGeneration >= this.latest.admissionGeneration) {
      this.latest = identity;
    }
  }

  recover(
    identity: AutoSaveAttemptIdentity | undefined,
    hasDirtyPaths: boolean
  ): AutoSaveAttemptIdentity | null {
    const failed = this.latest;
    if (
      !failed ||
      hasDirtyPaths ||
      (identity !== undefined && identity.admissionGeneration < failed.admissionGeneration)
    ) {
      return null;
    }
    this.latest = null;
    return identity ?? failed;
  }
}
