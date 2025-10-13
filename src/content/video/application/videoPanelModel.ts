export interface VideoPanelCallbacks {
  onAddCapture: () => void;
  onFinish: () => void;
  onCancel: () => void;
  onDeleteCapture: (id: string) => void;
  onSubmitCaptureEdit: (id: string, comment: string) => void | Promise<void>;
  onFocusCapture: (id: string) => void;
}

export interface VideoPanelCapture {
  id: string;
  index: number;
  kind: 'timestamp' | 'fragment';
  timeLabel?: string;
  timeSeconds?: number;
  fragmentLabel?: string;
  fragmentUrl?: string;
  shareUrl?: string;
  comment: string;
  commentPreview: string;
  selectionPreview?: string;
}

export interface VideoPanelTexts {
  title: string;
  status: string;
  counter: string;
  counterZero: string;
  add: string;
  finish: string;
  cancel: string;
  hint: string;
  captureEditLabel: string;
  captureDeleteLabel: string;
  captureNoComment: string;
  captureSaveLabel: string;
  captureCancelLabel: string;
  captureEditPlaceholder: string;
  captureFocusLabel: string;
}
