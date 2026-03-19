export type ClipPromptAction = 'clip' | 'cancel' | 'reader' | 'video';

export interface ClipPromptRequest {
  selectedText: string;
  allowReaderMode: boolean;
  readerModeBehavior: 'start' | 'append';
  allowVideoMode?: boolean;
  initialComment?: string;
}

export interface ClipPromptResponse {
  action: ClipPromptAction;
  comment: string;
}

export interface ClipPromptGateway {
  requestSelectionAction(request: ClipPromptRequest): Promise<ClipPromptResponse>;
}
