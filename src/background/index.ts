import { registerContextMenuListeners } from './listeners/contextMenus';
import { registerRuntimeMessageListener } from './listeners/runtimeMessages';
import { ensureUsageStatsInitialized } from './services/usageStats';

registerContextMenuListeners();
registerRuntimeMessageListener();
void ensureUsageStatsInitialized().catch(error => {
  console.error('[background] Failed to initialize usage stats storage:', error);
});
