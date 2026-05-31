import { resolveSessionPanelResizeStorage } from './sessionPanelResizeAdapter';
import type {
  SessionPanelLayoutSnapshot,
  SessionPanelResizeOptions,
  SessionPanelResizeStorage,
  SessionPanelStorageItems
} from './sessionPanelResizeTypes';

const WIDTH_STORAGE_KEY = 'aiob.sessionPanel.width';
const WIDTH_MAX_STORAGE_KEY = 'aiob.sessionPanel.maxWidth';
const HEIGHT_STORAGE_KEY = 'aiob.sessionPanel.height';
const COLLAPSED_STORAGE_KEY = 'aiob.sessionPanel.collapsed';

const persistedPanelLayout: SessionPanelLayoutSnapshot = {
  width: 0,
  maxWidth: 0,
  height: 0,
  collapsed: null
};
let persistedPanelLayoutRevision = 0;
const localLayoutRevisions = {
  width: 0,
  maxWidth: 0,
  height: 0,
  collapsed: 0
};
const storageLoad: WeakMap<
  SessionPanelResizeStorage,
  Promise<SessionPanelLayoutSnapshot>
> = new WeakMap();

type SessionPanelLayoutField = keyof typeof localLayoutRevisions;

function readPositiveInteger(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
}

function snapshot(): SessionPanelLayoutSnapshot {
  return { ...persistedPanelLayout };
}

function commitLocalLayout(fields: SessionPanelLayoutField[]): number {
  persistedPanelLayoutRevision += 1;
  for (const field of fields) {
    localLayoutRevisions[field] = persistedPanelLayoutRevision;
  }
  return persistedPanelLayoutRevision;
}

function canApplyLoadedField(field: SessionPanelLayoutField): boolean {
  return localLayoutRevisions[field] === 0;
}

function saveSessionPanelStorage(
  storage: SessionPanelResizeStorage,
  items: SessionPanelStorageItems,
  fields: SessionPanelLayoutField[] = []
): void {
  const saveRevision = persistedPanelLayoutRevision;
  try {
    void Promise.resolve(storage.save(items))
      .then(() => {
        for (const field of fields) {
          if (localLayoutRevisions[field] <= saveRevision) {
            localLayoutRevisions[field] = 0;
          }
        }
      })
      .catch(() => undefined);
  } catch {
    return;
  }
}

function loadPersistedPanelLayout(
  storage: SessionPanelResizeStorage
): Promise<SessionPanelLayoutSnapshot> {
  const existingLoad = storageLoad.get(storage);
  if (existingLoad) {
    return existingLoad.then(() => snapshot());
  }
  const loadRevision = persistedPanelLayoutRevision;
  const nextLoad = (async () => {
    try {
      const items = await storage.load();
      if (persistedPanelLayoutRevision !== loadRevision) {
        return snapshot();
      }
      if (canApplyLoadedField('width')) {
        persistedPanelLayout.width = readPositiveInteger(items[WIDTH_STORAGE_KEY]);
      }
      if (canApplyLoadedField('maxWidth')) {
        persistedPanelLayout.maxWidth = readPositiveInteger(items[WIDTH_MAX_STORAGE_KEY]);
      }
      if (canApplyLoadedField('height')) {
        persistedPanelLayout.height = readPositiveInteger(items[HEIGHT_STORAGE_KEY]);
      }
      if (canApplyLoadedField('collapsed')) {
        const collapsed = items[COLLAPSED_STORAGE_KEY];
        persistedPanelLayout.collapsed = typeof collapsed === 'boolean' ? collapsed : null;
      }
    } catch {
      return snapshot();
    }
    return snapshot();
  })();
  storageLoad.set(storage, nextLoad);
  return nextLoad;
}

export function getSessionPanelLayoutSnapshot(): SessionPanelLayoutSnapshot {
  return snapshot();
}

export function updateSessionPanelWidthDraft(width: number): SessionPanelLayoutSnapshot {
  commitLocalLayout(['width']);
  persistedPanelLayout.width = Math.round(width);
  return snapshot();
}

export function updateSessionPanelHeightDraft(height: number): SessionPanelLayoutSnapshot {
  commitLocalLayout(['height']);
  persistedPanelLayout.height = Math.round(height);
  return snapshot();
}

export async function loadPersistedSessionPanelLayout(
  options: SessionPanelResizeOptions = { storage: resolveSessionPanelResizeStorage() }
): Promise<SessionPanelLayoutSnapshot> {
  return loadPersistedPanelLayout(options.storage);
}

export function savePersistedSessionPanelWidth(
  width: number,
  maxWidth: number,
  options: SessionPanelResizeOptions
): void {
  commitLocalLayout(['width', 'maxWidth']);
  persistedPanelLayout.width = Math.round(width);
  persistedPanelLayout.maxWidth = Math.round(maxWidth);
  saveSessionPanelStorage(
    options.storage,
    {
      [WIDTH_STORAGE_KEY]: persistedPanelLayout.width,
      [WIDTH_MAX_STORAGE_KEY]: persistedPanelLayout.maxWidth
    },
    ['width', 'maxWidth']
  );
}

export function savePersistedSessionPanelHeight(
  height: number,
  options: SessionPanelResizeOptions
): void {
  commitLocalLayout(['height']);
  persistedPanelLayout.height = Math.round(height);
  saveSessionPanelStorage(options.storage, { [HEIGHT_STORAGE_KEY]: persistedPanelLayout.height }, [
    'height'
  ]);
}

export function saveSessionPanelCollapsed(
  collapsed: boolean,
  options: SessionPanelResizeOptions = { storage: resolveSessionPanelResizeStorage() }
): void {
  commitLocalLayout(['collapsed']);
  persistedPanelLayout.collapsed = collapsed;
  saveSessionPanelStorage(options.storage, { [COLLAPSED_STORAGE_KEY]: collapsed }, ['collapsed']);
}
