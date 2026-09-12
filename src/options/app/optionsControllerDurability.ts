import { deepClone } from '../utils/clone';
import type { OptionsMutationIntent } from './optionsDraftSession';

export interface DurableOptionsMutation {
  readonly intent: OptionsMutationIntent;
  readonly reason: 'auto' | 'manual';
}

export interface OptionsControllerDurabilityDeps {
  persist(this: void, mutation: DurableOptionsMutation): Promise<void>;
}

interface BlockedAdmission {
  readonly mutation: DurableOptionsMutation;
  readonly admissionGeneration: number;
  rethrow(): never;
}

export class OptionsControllerDurability {
  private pendingDesired: DurableOptionsMutation | null = null;
  private drainPromise: Promise<void> | null = null;
  private blockedAdmission: BlockedAdmission | null = null;
  private activeAdmissionGeneration: number | null = null;
  private discardedThroughGeneration = 0;

  constructor(private readonly persist: OptionsControllerDurabilityDeps['persist']) {}

  enqueue(mutation: DurableOptionsMutation): void {
    const generation = mutation.intent.admissionGeneration;
    const admissionFloor = Math.max(
      this.discardedThroughGeneration,
      this.activeAdmissionGeneration ?? 0,
      this.pendingDesired?.intent.admissionGeneration ?? 0,
      this.blockedAdmission?.admissionGeneration ?? 0
    );
    if (generation <= admissionFloor) return;
    this.pendingDesired = deepClone(mutation);
    this.blockedAdmission = null;
    this.ensureDrain();
  }

  discardRetryable(): void {
    this.discardedThroughGeneration = Math.max(
      this.discardedThroughGeneration,
      this.activeAdmissionGeneration ?? 0,
      this.pendingDesired?.intent.admissionGeneration ?? 0,
      this.blockedAdmission?.admissionGeneration ?? 0
    );
    this.pendingDesired = null;
    this.blockedAdmission = null;
  }

  async flush(): Promise<void> {
    if (this.blockedAdmission) {
      this.pendingDesired = this.blockedAdmission.mutation;
      this.blockedAdmission = null;
    }
    this.ensureDrain();

    while (this.drainPromise) {
      const activeDrain = this.drainPromise;
      await activeDrain;
      this.completeDrain(activeDrain);
    }

    const blockedAdmission = this.readBlockedAdmission();
    if (blockedAdmission) blockedAdmission.rethrow();
  }

  private ensureDrain(): void {
    if (this.drainPromise || this.blockedAdmission || !this.pendingDesired) return;

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
    while (this.pendingDesired && !this.blockedAdmission) {
      const desired = this.pendingDesired;
      this.pendingDesired = null;
      this.activeAdmissionGeneration = desired.intent.admissionGeneration;

      try {
        await this.persist(desired);
      } catch (error) {
        const generation = desired.intent.admissionGeneration;
        const pendingDesired = this.readPendingDesired();
        if (
          generation > this.discardedThroughGeneration &&
          (!pendingDesired || pendingDesired.intent.admissionGeneration <= generation)
        ) {
          this.pendingDesired = null;
          this.blockedAdmission = {
            mutation: desired,
            admissionGeneration: generation,
            rethrow(): never {
              throw error;
            }
          };
        }
      } finally {
        this.activeAdmissionGeneration = null;
      }
    }
  }

  private readBlockedAdmission(): BlockedAdmission | null {
    return this.blockedAdmission;
  }

  private readPendingDesired(): DurableOptionsMutation | null {
    return this.pendingDesired;
  }
}

export function createOptionsControllerDurability(
  deps: OptionsControllerDurabilityDeps
): OptionsControllerDurability {
  return new OptionsControllerDurability(deps.persist);
}
