import { registerContextMenuListeners } from './listeners/contextMenus';
import { registerRuntimeMessageListener } from './listeners/runtimeMessages';

registerContextMenuListeners();
registerRuntimeMessageListener();
