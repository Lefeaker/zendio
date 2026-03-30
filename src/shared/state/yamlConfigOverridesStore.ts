import type { IOptionsRepository } from '../repositories/IOptionsRepository';
import type { YamlConfigOverrides } from '../types/yamlConfig';
import { normalizeYamlConfigOverrides } from '../services/yamlConfigService';
import { cloneValue } from '../utils/cloneValue';

type OverridesListener = (overrides: YamlConfigOverrides | null) => void;

const listeners = new Set<OverridesListener>();
let overridesSnapshot: YamlConfigOverrides | null = null;
let unsubscribeRepo: (() => void) | null = null;
let repositoryInitialized = false;
let repositoryUnavailable = false;

const notifyListeners = (): void => {
  for (const listener of listeners) {
    try {
      listener(overridesSnapshot ? cloneValue(overridesSnapshot) : null);
    } catch (error) {
      console.error('[yamlConfigOverridesStore] Listener error', error);
    }
  }
};

const applyOverrides = (value: YamlConfigOverrides | null): void => {
  overridesSnapshot = value ? cloneValue(value) : null;
  notifyListeners();
};

const loadOptionsRepository = async (): Promise<IOptionsRepository | null> => {
  try {
    const [{ resolveRepository }, { DI_TOKENS }] = await Promise.all([
      import('../di/serviceRegistry'),
      import('../di/tokens')
    ]);
    const repo = resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
    if (typeof repo.get !== 'function' || typeof repo.onChange !== 'function') {
      console.warn('[yamlConfigOverridesStore] Options repository missing required methods');
      return null;
    }
    return repo;
  } catch (error) {
    console.warn('[yamlConfigOverridesStore] Options repository unavailable:', error);
    return null;
  }
};

const subscribeToOptionsRepository = (): void => {
  if (repositoryInitialized || repositoryUnavailable) {
    return;
  }
  repositoryInitialized = true;
  void loadOptionsRepository().then((optionsRepository) => {
    if (!optionsRepository) {
      repositoryUnavailable = true;
      return;
    }
    void optionsRepository
      .get()
      .then((options) => {
        const normalized = normalizeYamlConfigOverrides(options.yamlConfig ?? null);
        applyOverrides(normalized);
      })
      .catch((error) => {
        console.warn(
          '[yamlConfigOverridesStore] Failed to hydrate overrides from repository',
          error
        );
      });

    unsubscribeRepo = optionsRepository.onChange((snapshot) => {
      const normalized = normalizeYamlConfigOverrides(snapshot?.yamlConfig ?? null);
      applyOverrides(normalized);
    });
  });
};

subscribeToOptionsRepository();

export function getYamlConfigOverrides(): YamlConfigOverrides | null {
  subscribeToOptionsRepository();
  return overridesSnapshot ? cloneValue(overridesSnapshot) : null;
}

export function setYamlConfigOverrides(value: YamlConfigOverrides | null): void {
  subscribeToOptionsRepository();
  const normalized = normalizeYamlConfigOverrides(value);
  applyOverrides(normalized);
}

export function subscribeYamlConfigOverrides(listener: OverridesListener): () => void {
  subscribeToOptionsRepository();
  listeners.add(listener);
  listener(overridesSnapshot ? cloneValue(overridesSnapshot) : null);
  return () => {
    listeners.delete(listener);
  };
}

export function resetYamlConfigOverridesStore(): void {
  listeners.clear();
  overridesSnapshot = null;
  repositoryInitialized = false;
  repositoryUnavailable = false;
  if (unsubscribeRepo) {
    unsubscribeRepo();
    unsubscribeRepo = null;
  }
}
