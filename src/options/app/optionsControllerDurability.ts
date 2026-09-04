import { deepClone } from '../utils/clone';
import type { OptionsMutationIntent } from './optionsDraftSession';

export interface DurableOptionsMutation {
  readonly intent: OptionsMutationIntent;
  readonly reason: 'auto' | 'manual';
}

export interface OptionsControllerDurabilityDeps {
  persist(this: void, mutation: DurableOptionsMutation): Promise<void>;
}

export class OptionsControllerDurability {
  private pendingDesired: DurableOptionsMutation | null = null;
  private drainPromise: Promise<void> | null = null;
  private retryBlocked = false;
  private rethrowRetryFailure: (() => never) | null = null;

  constructor(private readonly persist: OptionsControllerDurabilityDeps['persist']) {}

  enqueue(mutation: DurableOptionsMutation): void {
    this.pendingDesired = deepClone(mutation);
    this.retryBlocked = false;
    this.rethrowRetryFailure = null;
    this.ensureDrain();
  }

  discardRetryable(): void {
    this.pendingDesired = null;
    this.retryBlocked = false;
    this.rethrowRetryFailure = null;
  }

  async flush(): Promise<void> {
    if (this.retryBlocked) {
      this.retryBlocked = false;
      this.rethrowRetryFailure = null;
    }
    this.ensureDrain();

    while (this.drainPromise) {
      const activeDrain = this.drainPromise;
      await activeDrain;
      this.completeDrain(activeDrain);
    }

    if (this.retryBlocked) {
      const rethrowRetryFailure = this.rethrowRetryFailure;
      if (rethrowRetryFailure) {
        rethrowRetryFailure();
      }
      throw new Error('OPTIONS_DURABILITY_HANDOFF_FAILED');
    }
  }

  private ensureDrain(): void {
    if (this.drainPromise || this.retryBlocked || !this.pendingDesired) return;

    const drain = this.drain();
    this.drainPromise = drain;
    void drain.then(() => this.completeDrain(drain));
  }

  private completeDrain(drain: Promise<void>): void {
    if (this.drainPromise !== drain) return;
    this.drainPromise = null;
    this.ensureDrain();
  }

  private async drain(): Promise<void> {
    while (this.pendingDesired && !this.retryBlocked) {
      const desired = this.pendingDesired;
      this.pendingDesired = null;

      try {
        await this.persist(desired);
      } catch (error) {
        if (!this.pendingDesired) {
          this.pendingDesired = desired;
          this.retryBlocked = true;
          this.rethrowRetryFailure = () => {
            throw error;
          };
        }
      }
    }
  }
}

export function createOptionsControllerDurability(
  deps: OptionsControllerDurabilityDeps
): OptionsControllerDurability {
  return new OptionsControllerDurability(deps.persist);
}
