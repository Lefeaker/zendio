import { type ClipperDialogOptions } from '../components/dialog';
import { createClipperDialog } from '../components/dialogFactory';
import type {
  ClipPromptGateway,
  ClipPromptRequest,
  ClipPromptResponse
} from '../application/clipPromptGateway';
import type { PopupCoordinator } from '../../runtime/popupCoordinator';
import { resolveContentPopupCoordinator } from '../../runtime/popupCoordinatorAccess';

class ClipperDialogPromptGateway implements ClipPromptGateway {
  async requestSelectionAction(request: ClipPromptRequest): Promise<ClipPromptResponse> {
    const dialog = createClipperDialog();
    const baseOptions: ClipperDialogOptions = {
      allowReaderMode: request.allowReaderMode,
      readerModeBehavior: request.readerModeBehavior
    };

    const withVideoOption =
      request.allowVideoMode === undefined
        ? baseOptions
        : { ...baseOptions, allowVideoMode: request.allowVideoMode };

    const dialogOptions =
      request.initialComment === undefined
        ? withVideoOption
        : { ...withVideoOption, initialComment: request.initialComment };
    const popupCoordinator = resolveContentPopupCoordinator();

    const result = await dialog.show(request.selectedText, {
      ...dialogOptions,
      ...(popupCoordinator ? { dialogRegistry: popupCoordinator } : {})
    });
    return {
      action: result.action,
      comment: result.comment ?? ''
    };
  }
}

export function createClipperDialogPromptGateway(): ClipPromptGateway {
  return new ClipperDialogPromptGateway();
}
