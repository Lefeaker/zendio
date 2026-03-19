/**
 * Firefox 平台适配层
 * 提供 Firefox 特定的 API 实现
 */

import { PlatformServices } from '../types';
import { firefoxStorageService } from './storage';
import { firefoxMessagingService } from './messaging';
import { firefoxRuntimeService } from './runtime';
import { firefoxContextMenusService } from './contextMenus';
import { firefoxNotificationsService } from './notifications';
import { firefoxTabsService } from './tabs';
import { firefoxActionService } from './action';
import { firefoxScriptingService } from './scripting';
import { createFetchRestClient } from '../../infrastructure/restClient';

/**
 * 创建 Firefox 平台服务
 */
function createFirefoxServices(): PlatformServices {
  const storage = firefoxStorageService;

  return {
    // Firefox API 服务
    storage,
    messaging: firefoxMessagingService,
    runtime: firefoxRuntimeService,
    contextMenus: firefoxContextMenusService,
    notifications: firefoxNotificationsService,
    tabs: firefoxTabsService,
    action: firefoxActionService,
    scripting: firefoxScriptingService,

    // 业务级服务
    restClient: createFetchRestClient()
  };
}

export { createFirefoxServices };
export * from './utils';
