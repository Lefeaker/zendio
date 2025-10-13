export interface ReaderPanelCallbacks {
  onFinish: () => void;
  onCancel: () => void;
  onDeleteHighlight: (id: string) => void;
  onSubmitHighlightEdit: (id: string, comment: string) => void | Promise<void>;
  onFocusHighlight: (id: string) => void;
}

export interface ReaderPanelHighlight {
  id: string;
  excerpt: string;
  comment: string;
  fullText: string;
  commentPreview: string;
  index: number;
}

export interface ReaderPanelTexts {
  title: string;
  status: string;
  counter: string;
  counterZero: string;
  finish: string;
  cancel: string;
  hint: string;
  highlightEditLabel: string;
  highlightDeleteLabel: string;
  highlightNoComment: string;
  highlightSaveLabel: string;
  highlightCancelLabel: string;
  highlightEditPlaceholder: string;
  highlightFocusLabel: string;
}
