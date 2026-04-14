import { createOptionsStateManager } from '../state/StateManager';
import { DEFAULT_USAGE_STATS, USAGE_STATS_STORAGE_KEY, normalizeUsageStats } from '../../shared/constants';
import type { StoredOptions } from '../../shared/types/options';
import type { UsageStats } from '../../shared/types/usage';
import { optionsStore } from '../state/optionsStore';
import { getGlobalStateManager } from '../../shared/state';

type OptionsShellStateManager = ReturnType<typeof createOptionsStateManager>;

const USAGE_STATE_KEY = 'optionsShell.usageStats';

export async function bindOptionsShellOptionsState(
  stateManager: OptionsShellStateManager
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

export async function bindOptionsShellUsageState(
  stateManager: OptionsShellStateManager
): Promise<Array<() => void>> {
  const disposers: Array<() => void> = [];
  const globalStateManager = getGlobalStateManager();
  const usageStore = globalStateManager.getStore<UsageStats>(USAGE_STATE_KEY);

  const syncEnabled = await globalStateManager.syncWithStorage(
    USAGE_STATE_KEY,
    USAGE_STATS_STORAGE_KEY
  );
  if (!syncEnabled) {
    stateManager.setState({
      usage: { ...DEFAULT_USAGE_STATS }
    });
  }

  const unsubscribeUsage = usageStore.subscribe((value) => {
    stateManager.setState({
      usage: normalizeUsageStats(value ?? DEFAULT_USAGE_STATS)
    });
  });
  disposers.push(unsubscribeUsage);
  disposers.push(() => {
    globalStateManager.stopSync(USAGE_STATE_KEY);
  });

  return disposers;
}
