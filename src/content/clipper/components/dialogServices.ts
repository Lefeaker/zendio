import type { Messages } from '@i18n';
import { contentErrors, type ErrorHandler } from '@shared/errors';
import type { StorageAreaService, StorageService } from '@platform/interfaces/storage';
import type { IClipRepository, FragmentConfig } from '@shared/repositories/IClipRepository';
import { getContentMessages } from '../../i18n/context';
import type { DialogSessionState } from './dialogSessionState';
import { SHORTCUT_USAGE_THRESHOLD, USAGE_COUNT_STORAGE_KEY } from './dialogShortcuts';

function getLocalStorageArea(storageService: StorageService): Partial<StorageAreaService> | null {
  return storageService.local ?? null;
}

export async function loadShortcutUsageCount(
  state: DialogSessionState,
  storageService: StorageService,
  errorHandler: ErrorHandler
): Promise<void> {
  const localStorage = getLocalStorageArea(storageService);
  if (typeof localStorage?.get !== 'function') {
    state.shortcutUsageCount = 0;
    return;
  }

  try {
    const stored = await localStorage.get<number>(USAGE_COUNT_STORAGE_KEY);
    state.shortcutUsageCount = stored ?? 0;
  } catch (error) {
    const appError = contentErrors.storageOperationFailed(
      'load',
      USAGE_COUNT_STORAGE_KEY,
      { component: 'ClipperDialog', action: 'loadShortcutUsageCount' },
      { cause: error }
    );
    await errorHandler.handle(appError, { suppressNotifications: true });
    state.shortcutUsageCount = 0;
  }
}

export async function saveShortcutUsageCount(
  state: DialogSessionState,
  storageService: StorageService,
  errorHandler: ErrorHandler
): Promise<void> {
  const localStorage = getLocalStorageArea(storageService);
  if (typeof localStorage?.set !== 'function') {
    return;
  }

  try {
    await localStorage.set(USAGE_COUNT_STORAGE_KEY, state.shortcutUsageCount);
  } catch (error) {
    const appError = contentErrors.storageOperationFailed(
      'save',
      USAGE_COUNT_STORAGE_KEY,
      {
        component: 'ClipperDialog',
        action: 'saveShortcutUsageCount',
        value: state.shortcutUsageCount
      },
      { cause: error }
    );
    await errorHandler.handle(appError, { suppressNotifications: true });
  }
}

export async function incrementShortcutUsage(
  state: DialogSessionState,
  storageService: StorageService,
  errorHandler: ErrorHandler
): Promise<void> {
  state.shortcutUsageCount += 1;
  if (state.shortcutUsageCount <= SHORTCUT_USAGE_THRESHOLD) {
    await saveShortcutUsageCount(state, storageService, errorHandler);
  }
}

export async function safeGetDialogMessages(errorHandler: ErrorHandler): Promise<Messages | null> {
  try {
    return await getContentMessages();
  } catch (error) {
    const appError = contentErrors.componentInitializationFailed(
      'content-messages',
      { component: 'ClipperDialog', action: 'getContentMessages' },
      { cause: error }
    );
    await errorHandler.handle(appError, { suppressNotifications: true });
    return null;
  }
}

export function applyDialogFragmentConfig(state: DialogSessionState, config: FragmentConfig): void {
  state.keyboardShortcutsEnabled = config.keyboardShortcutsEnabled;
}

export async function initializeDialogFragmentConfig(args: {
  clipRepo: IClipRepository;
  state: DialogSessionState;
  errorHandler: ErrorHandler;
}): Promise<void> {
  try {
    const config = await args.clipRepo.getFragmentConfig();
    applyDialogFragmentConfig(args.state, config);
  } catch (error) {
    const appError = contentErrors.componentInitializationFailed(
      'fragment-config',
      { component: 'ClipperDialog', action: 'initializeFragmentConfig' },
      { cause: error }
    );
    await args.errorHandler.handle(appError, { suppressNotifications: true });
    args.state.keyboardShortcutsEnabled = true;
  }
}

export function subscribeToDialogFragmentConfig(args: {
  clipRepo: IClipRepository;
  state: DialogSessionState;
  previous?: (() => void) | null;
}): () => void {
  args.previous?.();
  return args.clipRepo.onConfigChange((config) => {
    applyDialogFragmentConfig(args.state, config);
  });
}
