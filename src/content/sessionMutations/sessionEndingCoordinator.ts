interface SessionEndingOptions {
  state: { ending: boolean; disconnected: boolean };
  waitForIdle(): Promise<void>;
  hasPendingFinalization(): boolean;
  present(mode: 'busy' | 'retry' | 'ready'): void;
  onError(error: Error): void;
}

/** Close admission before draining edits; keep one finish/cancel operation until it settles. */
export function createSessionEndingCoordinator(options: SessionEndingOptions) {
  let pending: Promise<void> | null = null;
  return (action: () => Promise<void>): Promise<void> => {
    if (options.state.disconnected) return Promise.resolve();
    if (pending) return pending;
    options.state.ending = true;
    options.present('busy');
    pending = options
      .waitForIdle()
      .then(() => {
        if (!options.state.disconnected) return action();
      })
      .catch((error) => options.onError(error instanceof Error ? error : new Error(String(error))))
      .finally(() => {
        pending = null;
        const unfinished = options.hasPendingFinalization();
        options.state.ending = options.state.disconnected || unfinished;
        options.present(unfinished ? 'retry' : 'ready');
      });
    return pending;
  };
}
