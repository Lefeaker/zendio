import { ClipperDialog } from '../components/dialog';
import type {
  ClipPromptGateway,
  ClipPromptRequest,
  ClipPromptResponse
} from '../application/clipPromptGateway';

class ClipperDialogPromptGateway implements ClipPromptGateway {
  async requestSelectionAction(request: ClipPromptRequest): Promise<ClipPromptResponse> {
    const dialog = new ClipperDialog();
    const result = await dialog.show(request.selectedText, {
      allowReaderMode: request.allowReaderMode,
      readerModeBehavior: request.readerModeBehavior,
      initialComment: request.initialComment
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
