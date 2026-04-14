import { getContentService } from '../bootstrap';
import { TOKENS } from '../../shared/di/tokens';
import type { PopupCoordinator } from './popupCoordinator';

export function resolveContentPopupCoordinator(): PopupCoordinator | null {
  try {
    const candidate = getContentService<unknown>(TOKENS.dialogRegistry);
    if (
      candidate &&
      typeof candidate === 'object' &&
      'register' in candidate &&
      typeof (candidate as PopupCoordinator).register === 'function'
    ) {
      return candidate as PopupCoordinator;
    }
    return null;
  } catch {
    return null;
  }
}
