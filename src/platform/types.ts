import type { ActionService } from './interfaces/actions';
import type { ContextMenusService } from './interfaces/contextMenus';
import type { DownloadsService } from './interfaces/downloads';
import type { FileSystemAccessService } from './interfaces/fileSystemAccess';
import type { MessagingService } from './interfaces/messaging';
import type { NotificationsService } from './interfaces/notifications';
import type { RuntimeService } from './interfaces/runtime';
import type { ScriptingService } from './interfaces/scripting';
import type { StorageService } from './interfaces/storage';
import type { TabsService } from './interfaces/tabs';
import type { RestClient } from '../shared/interfaces/restClient';

export interface PlatformServices {
  // Chrome API 服务
  storage: StorageService;
  messaging: MessagingService;
  runtime: RuntimeService;
  contextMenus: ContextMenusService;
  downloads: DownloadsService;
  fileSystemAccess: FileSystemAccessService;
  notifications: NotificationsService;
  tabs: TabsService;
  action: ActionService;
  scripting: ScriptingService;

  restClient: RestClient;
}

export type PartialPlatformServices = Partial<PlatformServices>;
