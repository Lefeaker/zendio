import type {
  SessionDraftAutoRestoreDisposer,
  SessionDraftAutoRestoreOptions
} from './sessionDraftAutoRestore';

export interface SessionDraftAutoRestoreModule {
  startSessionDraftAutoRestore: (
    options: SessionDraftAutoRestoreOptions
  ) => SessionDraftAutoRestoreDisposer;
}

export type SessionDraftAutoRestoreLoader = () => Promise<SessionDraftAutoRestoreModule>;

export function startLazyDraftRestore(
  load: SessionDraftAutoRestoreLoader,
  options: SessionDraftAutoRestoreOptions,
  onLoadError: (error: unknown) => void
): SessionDraftAutoRestoreDisposer {
  let stopped = false;
  let dispose: SessionDraftAutoRestoreDisposer | undefined;

  void load().then(({ startSessionDraftAutoRestore }) => {
    if (!stopped) {
      dispose = startSessionDraftAutoRestore(options);
    }
  }, onLoadError);

  return () => {
    stopped = true;
    dispose?.();
  };
}
