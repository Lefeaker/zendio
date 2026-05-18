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
    async send<TResult = unknown>(): Promise<TResult> {
      return undefined as TResult;
    },
    async sendToTab<TResult = unknown>(): Promise<TResult> {
      return undefined as TResult;
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
    async create() {
      return undefined;
    },
    async remove() {},
    async getCurrent() {
      return undefined;
    },
    async get() {
      return undefined;
    },
    async query() {
      return [];
    },
    async sendMessage<TResult = unknown>(): Promise<TResult> {
      return undefined as TResult;
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
    async create() {
      return 'preview';
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
    async create(id) {
      return id;
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
    async executeScript() {
      return [];
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
    async chooseDirectory() {
      throw new Error('File System Access API is unavailable in preview.');
    },
    async queryPermission() {
      return 'unsupported';
    },
    async ensurePermission() {
      return 'unsupported';
    },
    async writeFile() {
      throw new Error('File System Access API is unavailable in preview.');
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
