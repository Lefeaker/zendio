import { showOptionsConfirmFlow, type ConfirmDialogOptions } from '@ui/patterns/confirm-flow';
import { getOptionsI18nBinder } from '../../app/i18nContext';
import { bindLocalizedText, unbindLocalizedContent } from '../../utils/localizedText';

export type { ConfirmDialogOptions };

export function showConfirmDialog(options: ConfirmDialogOptions): Promise<boolean> {
  return showOptionsConfirmFlow({
    ...options,
    localization: {
      binder: getOptionsI18nBinder(),
      bindText: bindLocalizedText,
      unbind: unbindLocalizedContent
    }
  });
}
