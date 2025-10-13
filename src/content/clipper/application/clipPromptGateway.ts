export type ClipPromptAction = 'clip' | 'cancel' | 'reader';

export interface ClipPromptRequest {
  selectedText: string;
  allowReaderMode: boolean;
  readerModeBehavior: 'start' | 'append';
  initialComment?: string;
}

export interface ClipPromptResponse {
  action: ClipPromptAction;
  comment: string;
}

export interface ClipPromptGateway {
  requestSelectionAction(request: ClipPromptRequest): Promise<ClipPromptResponse>;
}
