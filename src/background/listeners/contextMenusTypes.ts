import type { ActionService } from '../../platform/interfaces/actions';
import type { ContextMenusService } from '../../platform/interfaces/contextMenus';
import type { RuntimeService } from '../../platform/interfaces/runtime';
import type { TabsService } from '../../platform/interfaces/tabs';
import type { ScriptingService } from '../../platform/interfaces/scripting';
import type { MessagingService } from '../../platform/interfaces/messaging';
import type { IOptionsRepository } from '../../shared/repositories';

export interface ContextMenuListenerDependencies {
  action: Pick<ActionService, 'onClicked'>;
  contextMenus: Pick<
    ContextMenusService,
    'create' | 'update' | 'removeAll' | 'onClicked' | 'onShown' | 'refresh'
  >;
  runtime: Pick<RuntimeService, 'onInstalled' | 'onStartup'>;
  tabs: Pick<
    TabsService,
    'query' | 'get' | 'sendMessage' | 'onActivated' | 'onUpdated' | 'onRemoved'
  >;
  scripting: Pick<ScriptingService, 'executeScript'>;
  messaging: Pick<MessagingService, 'addListener'>;
  optionsRepository: Pick<IOptionsRepository, 'onChange'>;
}

export interface ContextMenuRuntimeState {
  clipSelectionDefaultTitle: string;
  clipSelectionVideoTitle: string;
  clipFullPageTitle: string;
  videoModeTitle: string;
  selectionModifierInjectionEnabled: boolean;
  isSettingUpContextMenus: boolean;
  tabVideoState: Map<number, boolean>;
  autoInjectedTabs: Set<number>;
}

export function createContextMenuRuntimeState(): ContextMenuRuntimeState {
  return {
    clipSelectionDefaultTitle: 'Clip selection to Obsidian',
    clipSelectionVideoTitle: 'Clip to video capture panel',
    clipFullPageTitle: 'Clip full page to Obsidian',
    videoModeTitle: 'Enter video capture mode',
    selectionModifierInjectionEnabled: false,
    isSettingUpContextMenus: false,
    tabVideoState: new Map<number, boolean>(),
    autoInjectedTabs: new Set<number>()
  };
}
