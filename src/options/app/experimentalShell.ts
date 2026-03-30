import { OptionsApp, type OptionsAppUIConfig } from '../components/layout/OptionsApp';
import { createOptionsStateManager } from '../state/StateManager';
import { defaultOptionsState, type OptionsState } from '../state/types';
import {
  DEFAULT_USAGE_STATS,
  USAGE_STATS_STORAGE_KEY,
  normalizeUsageStats
} from '../../shared/constants';
import { getOptionsMessages } from './i18nContext';
import { getCurrentLanguage } from '../../i18n';
import type { UsageStats } from '../../shared/types/usage';
import type { StoredOptions } from '../../shared/types/options';
import { optionsStore } from '../state/optionsStore';
import { getGlobalStateManager } from '../../shared/state';
import type { FormSectionRegistry } from '../components/formSections/formSectionManager';

const STORAGE_FLAG_KEY = 'aiinob:options-shell-enabled';
const QUERY_FLAG_KEY = 'optionsShell';

interface ShellWindow extends Window {
  aiobUsageStats?: UsageStats & { total?: number };
}

export interface MountedOptionsShell {
  cleanup: () => void;
  stateManager: ReturnType<typeof createOptionsStateManager>;
  mountSection: (sectionId: string, options?: { activate?: boolean }) => Promise<void>;
  navigateTo: (sectionId: string) => Promise<void>;
  isSectionMounted: (sectionId: string) => boolean;
  preloadSections: (sectionIds: string[]) => Promise<void>;
  configureUI: (config: OptionsAppUIConfig) => void;
  initialSection: string;
  mountAllSections: () => Promise<void>;
  getMountedSection: (sectionId: string) => unknown | null;
}

export async function mountExperimentalShell(
  formRegistry: FormSectionRegistry
): Promise<MountedOptionsShell | null> {
  if (typeof document === 'undefined') {
    throw new Error('[OptionsShell] document is unavailable during shell mount.');
  }

  if (!isExperimentalShellEnabled()) {
    return null;
  }

  const container = document.getElementById('optionsShellRoot');
  if (!container) {
    console.warn('[OptionsShell] 未找到 optionsShellRoot 容器，将跳过实验性 UI 挂载。');
    return null;
  }

  const messages = await getOptionsMessages();
  const language = await getCurrentLanguage();
  const usage = getInitialUsageStats();
  const stateManager = createOptionsStateManager(buildInitialState(language, usage));
  const initialSection = resolveInitialSection();

  const app = new OptionsApp(container);
  app.setMessages(messages);
  app.render({
    stateManager,
    initialSection,
    formRegistry
  });

  try {
    await app.mountSection(initialSection, true);
  } catch (error) {
    console.error('[OptionsShell] 首屏 Section 挂载失败:', error);
  }

  container.removeAttribute('hidden');
  container.classList.add('is-shell-mounted');
  document.body.classList.add('aobx-shell-active');

  const cleanupHandlers: Array<() => void> = [];
  cleanupHandlers.push(...(await bindOptionsState(stateManager)));
  cleanupHandlers.push(...(await bindUsageState(stateManager)));
  let disposed = false;

  const cleanup = (): void => {
    disposed = true;
    try {
      app.destroy();
    } catch (error) {
      console.error('[OptionsShell] 卸载实验性 UI 时出错:', error);
    }

    cleanupHandlers.forEach((dispose) => {
      try {
        dispose();
      } catch (error) {
        console.error('[OptionsShell] 清理监听器时出错:', error);
      }
    });

    container.replaceChildren();
    container.setAttribute('hidden', 'hidden');
    container.classList.remove('is-shell-mounted');
    document.body.classList.remove('aobx-shell-active');
  };

  const collectSectionIds = (): string[] => {
    const ids: string[] = [];
    app.forEachSection((sectionId) => {
      ids.push(sectionId);
    });
    return ids;
  };

  const mountAllSections = async (): Promise<void> => {
    if (disposed) {
      return;
    }
    const sectionIds = collectSectionIds();
    for (const sectionId of sectionIds) {
      if (disposed) {
        return;
      }
      if (sectionId === initialSection && app.getMountedSection(sectionId)) {
        continue;
      }
      try {
        await app.mountSection(sectionId, false);
      } catch (error) {
        console.error('[OptionsShell] 挂载 Section 失败:', sectionId, error);
      }
    }
  };

  return {
    cleanup,
    stateManager,
    initialSection,
    mountAllSections,
    configureUI: (config: OptionsAppUIConfig) => {
      if (disposed) {
        return;
      }
      app.configureUI(config);
    },
    mountSection: async (sectionId: string, options?: { activate?: boolean }) => {
      if (disposed) {
        return;
      }
      await app.mountSection(sectionId, options?.activate ?? false);
    },
    navigateTo: async (sectionId: string) => {
      if (disposed) {
        return;
      }
      await app.navigateTo(sectionId);
    },
    isSectionMounted: (sectionId: string) => {
      if (disposed) {
        return false;
      }
      return app.getMountedSection(sectionId) !== null;
    },
    preloadSections: async (sectionIds: string[]) => {
      if (disposed) {
        return;
      }
      await app.preloadSections(sectionIds);
    },
    getMountedSection: (sectionId: string) => {
      if (disposed) {
        return null;
      }
      return app.getMountedSection(sectionId);
    }
  };
}

function isExperimentalShellEnabled(locationValue: Location = window.location): boolean {
  const searchParams = new URLSearchParams(locationValue.search);
  const queryValue = searchParams.get(QUERY_FLAG_KEY);
  if (queryValue !== null) {
    const enabled = parseBoolean(queryValue);
    persistExperimentalShellPreference(enabled ? '1' : '0');
    return enabled;
  }

  const persisted = getPersistedExperimentalShellPreference();
  if (persisted !== null) {
    return parseBoolean(persisted);
  }

  persistExperimentalShellPreference('1');
  return true;
}

function getPersistedExperimentalShellPreference(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_FLAG_KEY);
  } catch {
    return null;
  }
}

function persistExperimentalShellPreference(value: '0' | '1'): void {
  try {
    window.localStorage.setItem(STORAGE_FLAG_KEY, value);
  } catch {
    // Ignore unavailable storage in non-browser or locked-down contexts.
  }
}

function parseBoolean(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function buildInitialState(language: string, usage: UsageStats): OptionsState {
  return {
    ...defaultOptionsState,
    language,
    usage,
    isInitialized: false
  };
}

function getInitialUsageStats(): UsageStats {
  const globalUsage = (window as ShellWindow).aiobUsageStats;
  if (globalUsage) {
    return normalizeUsageStats(globalUsage);
  }
  return { ...DEFAULT_USAGE_STATS };
}

function resolveInitialSection(): string {
  if (typeof window === 'undefined') {
    return 'usage';
  }
  const hash = window.location.hash.replace('#', '');
  if (hash.startsWith('section-')) {
    const sectionId = hash.slice('section-'.length);
    return sectionId.trim() || 'usage';
  }
  return 'usage';
}

async function bindOptionsState(
  stateManager: ReturnType<typeof createOptionsStateManager>
): Promise<Array<() => void>> {
  const disposers: Array<() => void> = [];

  try {
    const stored = await optionsStore.load();
    stateManager.setState({
      options: stored,
      isInitialized: true
    });
  } catch (error) {
    console.warn('[OptionsShell] 加载选项数据失败:', error);
  }

  const unsubscribeStore = optionsStore.subscribe((value: StoredOptions | undefined) => {
    stateManager.setState({
      options: value ?? null,
      isInitialized: true
    });
  });
  disposers.push(unsubscribeStore);

  return disposers;
}

const USAGE_STATE_KEY = 'optionsShell.usageStats';

async function bindUsageState(
  stateManager: ReturnType<typeof createOptionsStateManager>
): Promise<Array<() => void>> {
  const disposers: Array<() => void> = [];
  const manager = getGlobalStateManager();
  const store = manager.getStore<UsageStats | undefined>(USAGE_STATE_KEY);

  const handleUpdate = (value?: UsageStats): void => {
    stateManager.setState({ usage: normalizeUsageStats(value ?? DEFAULT_USAGE_STATS) });
  };

  handleUpdate(store.get());
  const unsubscribeStore = store.subscribe((value) => {
    handleUpdate(value);
  });
  disposers.push(unsubscribeStore);

  const synced = await manager.syncWithStorage<UsageStats, UsageStats>(
    USAGE_STATE_KEY,
    USAGE_STATS_STORAGE_KEY,
    {
      area: 'local',
      deserialize: (value) => normalizeUsageStats(value ?? DEFAULT_USAGE_STATS),
      onError: (error) => {
        console.warn('[OptionsShell] 同步 usage 数据失败:', error);
      }
    }
  );

  if (!synced) {
    handleUpdate();
  }

  disposers.push(() => manager.stopSync(USAGE_STATE_KEY));

  return disposers;
}
