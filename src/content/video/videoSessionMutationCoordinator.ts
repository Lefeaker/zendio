import { createSessionMutationRunner } from '../sessionDrafts';
import type { VideoCaptureMutationTransaction } from './videoCaptureMutationTypes';
import type { VideoSessionMutationPort } from './videoSessionRuntimePorts';

interface SavingStateOwner {
  saving: boolean;
  disconnected?: boolean;
}

export class VideoSessionMutationCoordinator implements VideoSessionMutationPort {
  private readonly runner = createSessionMutationRunner();
  private pendingCaptureMutations = 0;

  constructor(private readonly state: SavingStateOwner) {}

  waitForIdle(): Promise<void> {
    return this.runner.waitForIdle();
  }

  hasPendingMutations(): boolean {
    return this.pendingCaptureMutations > 0;
  }

  async runCaptureMutation<Result>(
    transaction: VideoCaptureMutationTransaction<Result>
  ): Promise<boolean> {
    this.pendingCaptureMutations += 1;
    this.state.saving = true;

    try {
      return await this.runner.run({
        ...transaction,
        shouldRun: () => !this.state.disconnected,
        isSaveFailure: (saveHint) => saveHint === 'failure'
      });
    } finally {
      this.pendingCaptureMutations = Math.max(0, this.pendingCaptureMutations - 1);
      this.state.saving = this.pendingCaptureMutations > 0;
    }
  }
}
