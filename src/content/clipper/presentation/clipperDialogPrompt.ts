import { type ClipperDialogOptions } from '../components/dialog';
import { createClipperDialog } from '../components/dialogFactory';
import type {
  ClipPromptGateway,
  ClipPromptRequest,
  ClipPromptResponse
} from '../application/clipPromptGateway';
import { resolveContentPopupCoordinator } from '../../runtime/popupCoordinatorAccess';

export function createClipperDialogPromptGateway(): ClipPromptGateway {
  return {
    async requestSelectionAction(request: ClipPromptRequest): Promise<ClipPromptResponse> {
      const dialog = createClipperDialog();
      const dialogOptions: ClipperDialogOptions = {
        allowReaderMode: request.allowReaderMode,
        readerModeBehavior: request.readerModeBehavior,
        ...(request.allowVideoMode === undefined ? {} : { allowVideoMode: request.allowVideoMode }),
        ...(request.initialComment === undefined ? {} : { initialComment: request.initialComment })
      };
      const popupCoordinator = resolveContentPopupCoordinator();

      return await dialog.show(request.selectedText, {
        ...dialogOptions,
        ...(popupCoordinator ? { dialogRegistry: popupCoordinator } : {})
      });
    }
  };
}
