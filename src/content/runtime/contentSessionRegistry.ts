type ContentSessionRegistryState = {
  readerSession: unknown | null;
  videoSession: unknown | null;
};

const state: ContentSessionRegistryState = {
  readerSession: null,
  videoSession: null
};

function getRoot(doc: Document = document): HTMLElement {
  return doc.documentElement;
}

function setDatasetFlag(root: HTMLElement, key: string, active: boolean): void {
  if (active) {
    root.dataset[key] = 'true';
    return;
  }
  delete root.dataset[key];
}

export function markContentRuntimeInitialized(doc: Document = document): boolean {
  const root = getRoot(doc);
  if (root.dataset.aiobContentRuntime === 'true') {
    return false;
  }
  root.dataset.aiobContentRuntime = 'true';
  return true;
}

export function registerReaderSession(session: unknown, doc: Document = document): void {
  state.readerSession = session;
  setDatasetFlag(getRoot(doc), 'aiobReaderActive', true);
}

export function clearReaderSession(session?: unknown, doc: Document = document): void {
  if (session !== undefined && state.readerSession !== session) {
    return;
  }
  state.readerSession = null;
  setDatasetFlag(getRoot(doc), 'aiobReaderActive', false);
}

export function getReaderSession<T>(): T | null {
  return (state.readerSession as T | null) ?? null;
}

export function isReaderSessionActive(doc: Document = document): boolean {
  return state.readerSession !== null || getRoot(doc).dataset.aiobReaderActive === 'true';
}

export function registerVideoSession(session: unknown, doc: Document = document): void {
  state.videoSession = session;
  setDatasetFlag(getRoot(doc), 'aiobVideoActive', true);
}

export function clearVideoSession(session?: unknown, doc: Document = document): void {
  if (session !== undefined && state.videoSession !== session) {
    return;
  }
  state.videoSession = null;
  setDatasetFlag(getRoot(doc), 'aiobVideoActive', false);
}

export function getVideoSession<T>(): T | null {
  return (state.videoSession as T | null) ?? null;
}

export function isVideoSessionActive(doc: Document = document): boolean {
  return state.videoSession !== null || getRoot(doc).dataset.aiobVideoActive === 'true';
}

export function __resetContentSessionRegistryForTests(doc: Document = document): void {
  state.readerSession = null;
  state.videoSession = null;
  const root = getRoot(doc);
  delete root.dataset.aiobContentRuntime;
  delete root.dataset.aiobReaderActive;
  delete root.dataset.aiobVideoActive;
}
