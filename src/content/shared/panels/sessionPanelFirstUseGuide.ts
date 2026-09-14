import { getService } from '@shared/di';
import { TOKENS } from '@shared/di/tokens';
import type { PlatformServices } from '@platform/types';
import type { StorageAreaService } from '@platform/interfaces/storage';

export function bindSessionPanelFirstUseGuide(
  root: HTMLElement,
  mode: 'reader' | 'video',
  storage: Pick<StorageAreaService, 'get' | 'set'> = getService<PlatformServices>(
    TOKENS.platformServices
  ).storage.local
): () => void {
  const button = root.querySelector<HTMLButtonElement>(
    '[data-action-id="session:dismissFirstUseGuide"]'
  );
  const key = `aiob.firstUse.${mode}Panel.v1`;
  let inactive = false;

  const dismiss = (event: MouseEvent) => {
    event.stopPropagation();
    inactive = true;
    delete root.dataset.sessionFirstUse;
    void storage.set(key, true).catch((error) => {
      console.warn('[SessionPanel] Failed to save guide acknowledgement:', error);
    });
  };
  button?.addEventListener('click', dismiss);
  void storage
    .get<boolean>(key)
    .then((acknowledged) => {
      if (!inactive && acknowledged !== true) root.dataset.sessionFirstUse = 'true';
    })
    .catch((error) => {
      console.warn('[SessionPanel] Failed to load guide acknowledgement:', error);
    });

  return () => {
    inactive = true;
    button?.removeEventListener('click', dismiss);
    delete root.dataset.sessionFirstUse;
  };
}
