export function ensureWindowLocalStorage(): Storage {
  let current: Partial<Storage> | undefined;
  try {
    current = window.localStorage as Partial<Storage>;
  } catch {
    current = undefined;
  }

  if (
    current &&
    typeof current.clear === 'function' &&
    typeof current.getItem === 'function' &&
    typeof current.key === 'function' &&
    typeof current.removeItem === 'function' &&
    typeof current.setItem === 'function'
  ) {
    return current as Storage;
  }

  const entries = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return entries.size;
    },
    clear() {
      entries.clear();
    },
    getItem(key: string) {
      return entries.get(String(key)) ?? null;
    },
    key(index: number) {
      return Array.from(entries.keys())[index] ?? null;
    },
    removeItem(key: string) {
      entries.delete(String(key));
    },
    setItem(key: string, value: string) {
      entries.set(String(key), String(value));
    }
  };

  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: storage
  });

  return storage;
}
