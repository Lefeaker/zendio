import type { CompleteOptions, StoredOptions } from '../../shared/types/options';
import { deepClone } from '../utils/clone';

type DurableOptionsDraft = CompleteOptions | StoredOptions;

export interface OptionsControllerDurabilityDeps {
  persist(this: void, draft: DurableOptionsDraft): Promise<void>;
}

export class OptionsControllerDurability {
  private pendingDesired: DurableOptionsDraft | null = null;
  private drainPromise: Promise<void> | null = null;
  private retryBlocked = false;

  constructor(private readonly persist: OptionsControllerDurabilityDeps['persist']) {}

  enqueue(draft: DurableOptionsDraft): void {
    this.pendingDesired = deepClone(draft);
    this.retryBlocked = false;
    this.ensureDrain();
  }

  private ensureDrain(): void {
    if (this.drainPromise || this.retryBlocked || !this.pendingDesired) return;

    const drain = this.drain();
    this.drainPromise = drain;
    void drain.finally(() => {
      if (this.drainPromise !== drain) return;
      this.drainPromise = null;
      this.ensureDrain();
    });
  }

  private async drain(): Promise<void> {
    while (this.pendingDesired && !this.retryBlocked) {
      const desired = this.pendingDesired;
      this.pendingDesired = null;

      try {
        await this.persist(desired);
      } catch {
        if (!this.pendingDesired) {
          this.pendingDesired = desired;
          this.retryBlocked = true;
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
