export type ChromeChangeListener = (
  changes: Record<string, { oldValue?: unknown; newValue?: unknown }>,
  areaName: string
) => void;

export type ChromeStorageGet = (
  keys: string | string[] | Record<string, unknown> | null,
  callback: (items: Record<string, unknown>) => void
) => void;

export type ChromeStorageSet = (items: Record<string, unknown>, callback?: () => void) => void;

export interface ChromeMock {
  storage: {
    sync: {
      get: ChromeStorageGet;
      set: ChromeStorageSet;
    };
    onChanged: {
      addListener: (listener: ChromeChangeListener) => void;
      removeListener: (listener: ChromeChangeListener) => void;
    };
  };
}

export function createChromeMock(params: {
  get: ChromeStorageGet;
  set: ChromeStorageSet;
  addListener: (listener: ChromeChangeListener) => void;
  removeListener: (listener: ChromeChangeListener) => void;
}): ChromeMock {
  return {
    storage: {
      sync: {
        get: params.get,
        set: params.set
      },
      onChanged: {
        addListener: params.addListener,
        removeListener: params.removeListener
      }
    }
  };
}
