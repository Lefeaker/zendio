import { getService } from '../../../shared/di';
import { TOKENS } from '../../../shared/di/tokens';
import type { StorageAreaService } from '../../../platform/interfaces/storage';
import type { PlatformServices } from '../../../platform/types';
import type { SessionPanelResizeStorage } from './sessionPanelResize';

const WIDTH_STORAGE_KEY = 'aiob.sessionPanel.width';
const WIDTH_MAX_STORAGE_KEY = 'aiob.sessionPanel.maxWidth';
const HEIGHT_STORAGE_KEY = 'aiob.sessionPanel.height';

function createSessionPanelResizeStorage(area: StorageAreaService): SessionPanelResizeStorage {
  return {
    async load() {
      return area.getMany([WIDTH_STORAGE_KEY, WIDTH_MAX_STORAGE_KEY, HEIGHT_STORAGE_KEY]);
    },
    save(items) {
      void area.setMany(items);
    }
  };
}

export function resolveSessionPanelResizeStorage(): SessionPanelResizeStorage {
  const platformServices = getService<PlatformServices>(TOKENS.platformServices);
  return createSessionPanelResizeStorage(platformServices.storage.local);
}
