import type { RestClient } from '../../shared/interfaces/restClient';
import type { ActionService } from '../interfaces/actions';
import type { ContextMenusService } from '../interfaces/contextMenus';
import type { DownloadsService } from '../interfaces/downloads';
import type { FileSystemAccessService } from '../interfaces/fileSystemAccess';
import type { MessagingService } from '../interfaces/messaging';
import type { NotificationsService } from '../interfaces/notifications';
import type { RuntimeService } from '../interfaces/runtime';
import type { ScriptingService } from '../interfaces/scripting';
import type { StorageService } from '../interfaces/storage';
import type { TabsService } from '../interfaces/tabs';
import type { PlatformServices } from '../types';
import { createMemoryStorageService } from './memoryStorage';

function createPreviewMessagingService(): MessagingService {
  return {
    send<TResult = unknown>(): Promise<TResult> {
      return Promise.resolve(undefined as TResult);
    },
    sendToTab<TResult = unknown>(): Promise<TResult> {
      return Promise.resolve(undefined as TResult);
    },
    addListener() {
      return () => {};
    }
  };
}

function createPreviewRuntimeService(): RuntimeService {
  return {
    getURL(path: string): string {
      return path;
    },
    async openOptionsPage(): Promise<void> {},
    getManifest() {
      return { version: 'preview' };
    },
    onInstalled() {
      return () => {};
    },
    onStartup() {
      return () => {};
    }
  };
}

function createPreviewTabsService(): TabsService {
  return {
    create() {
      return Promise.resolve(undefined);
    },
    async remove() {},
    getCurrent() {
      return Promise.resolve(undefined);
    },
    get() {
      return Promise.resolve(undefined);
    },
    query() {
      return Promise.resolve([]);
    },
    sendMessage<TResult = unknown>(): Promise<TResult> {
      return Promise.resolve(undefined as TResult);
    },
    onActivated() {
      return () => {};
    },
    onUpdated() {
      return () => {};
    },
    onRemoved() {
      return () => {};
    }
  };
}

function createPreviewContextMenusService(): ContextMenusService {
  return {
    create() {
      return Promise.resolve('preview');
    },
    async update() {},
    async removeAll() {},
    onClicked() {
      return () => {};
    },
    onShown() {
      return () => {};
    },
    refresh() {}
  };
}

function createPreviewNotificationsService(): NotificationsService {
  return {
    create(id) {
      return Promise.resolve(id);
    },
    async clear() {}
  };
}

function createPreviewActionService(): ActionService {
  return {
    onClicked() {
      return () => {};
    },
    async setBadgeText() {},
    async setBadgeBackgroundColor() {}
  };
}

function createPreviewScriptingService(): ScriptingService {
  return {
    executeScript() {
      return Promise.resolve([]);
    }
  };
}

function createPreviewRestClient(): RestClient {
  return {
    async writeFile() {}
  };
}

function createPreviewDownloadsService(): DownloadsService {
  return {
    download() {
      return Promise.resolve(undefined);
    }
  };
}

function createPreviewFileSystemAccessService(): FileSystemAccessService {
  return {
    isSupported() {
      return false;
    },
    chooseDirectory() {
      return Promise.reject(new Error('File System Access API is unavailable in preview.'));
    },
    queryPermission() {
      return Promise.resolve('unsupported');
    },
    ensurePermission() {
      return Promise.resolve('unsupported');
    },
    writeFile() {
      return Promise.reject(new Error('File System Access API is unavailable in preview.'));
    },
    async removeDirectory() {}
  };
}

export function createPreviewPlatformServices(
  storage: StorageService = createMemoryStorageService()
): PlatformServices {
  return {
    storage,
    messaging: createPreviewMessagingService(),
    runtime: createPreviewRuntimeService(),
    contextMenus: createPreviewContextMenusService(),
    downloads: createPreviewDownloadsService(),
    fileSystemAccess: createPreviewFileSystemAccessService(),
    notifications: createPreviewNotificationsService(),
    tabs: createPreviewTabsService(),
    action: createPreviewActionService(),
    scripting: createPreviewScriptingService(),
    restClient: createPreviewRestClient()
  };
}
