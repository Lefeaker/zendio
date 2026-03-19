import { type ClipperDialogOptions } from '../components/dialog';
import { createClipperDialog } from '../components/dialogFactory';
import type {
  ClipPromptGateway,
  ClipPromptRequest,
  ClipPromptResponse
} from '../application/clipPromptGateway';

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

    const result = await dialog.show(request.selectedText, dialogOptions);
    return {
      action: result.action,
      comment: result.comment ?? ''
    };
  }
}

export function createClipperDialogPromptGateway(): ClipPromptGateway {
  return new ClipperDialogPromptGateway();
}
