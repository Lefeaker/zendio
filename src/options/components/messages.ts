import type { Messages } from '../../i18n';
import { getElementById, getOptionalElementById } from '../utils/dom';
import { OptionsValidationError } from '../services/validation';
import { ConfigTransferError } from '../services/configTransfer';
import { bindLocalizedText, type BoundElement, type LocalizedContent } from '../utils/localizedText';

type MessageType = 'success' | 'error';

type MessageContent = string | LocalizedContent;

interface MessageState {
  timer: number | undefined;
  binding: BoundElement<HTMLElement> | null;
}

const transferMessageState: MessageState = { timer: undefined, binding: null };
const statusMessageState: MessageState = { timer: undefined, binding: null };

// ✅ Phase 1 DaisyUI migration: 使用 Alert 语义类替代手动样式
const MESSAGE_CLASS_CONFIG = {
  transfer: {
    base: 'alert mt-3',
    success: 'alert alert-success mt-3',
    error: 'alert alert-error mt-3',
    timeoutMs: 2500
  },
  status: {
    base: 'aobx-status-message',
    success: 'aobx-status-message is-success',
    error: 'aobx-status-message is-error',
    timeoutMs: 2000
  }
} as const;

export function showTransferMessage(type: MessageType, content: MessageContent): void {
  const element = getOptionalElementById<HTMLSpanElement>('configTransferMsg');
  if (!element) {
    return;
  }
  applyMessage(element, type, content, transferMessageState, MESSAGE_CLASS_CONFIG.transfer);
}

export function clearTransferMessage(): void {
  const element = getOptionalElementById<HTMLSpanElement>('configTransferMsg');
  if (!element) {
    return;
  }
  clearMessage(element, transferMessageState, MESSAGE_CLASS_CONFIG.transfer.base);
}

export function showStatusMessage(type: MessageType, content: MessageContent): void {
  const element = getElementById<HTMLSpanElement>('msg');
  applyMessage(element, type, content, statusMessageState, MESSAGE_CLASS_CONFIG.status);
}

export function formatOptionsError(error: unknown, msgs: Messages): string {
  if (error instanceof OptionsValidationError) {
    return error.detail ? `${msgs.invalidTaxonomy}: ${error.detail}` : msgs.invalidTaxonomy;
  }

  if (error instanceof ConfigTransferError) {
    switch (error.code) {
      case 'EMPTY_IMPORT':
        return msgs.emptyImportError;
      case 'CLIPBOARD_UNAVAILABLE':
        return msgs.clipboardUnavailable;
      case 'CLIPBOARD_READ_UNAVAILABLE':
        return msgs.clipboardReadUnavailable;
      case 'PARSE_FAILED':
      default:
        return error.detail ? `${msgs.importParseFailed}: ${error.detail}` : msgs.importParseFailed;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

interface MessageClassConfig {
  base: string;
  success: string;
  error: string;
  timeoutMs: number;
}

function applyMessage(
  element: HTMLElement,
  type: MessageType,
  content: MessageContent,
  state: MessageState,
  classConfig: MessageClassConfig
): void {
  ensureMessageAccessibility(element);
  updateElementClass(element, type, classConfig);
  updateMessageContent(element, content, state);

  if (state.timer) {
    window.clearTimeout(state.timer);
  }

  state.timer = window.setTimeout(() => {
    clearMessage(element, state, classConfig.base);
  }, classConfig.timeoutMs);
}

function updateElementClass(element: HTMLElement, type: MessageType, classConfig: MessageClassConfig): void {
  element.className = type === 'success' ? classConfig.success : classConfig.error;
}

function clearMessage(element: HTMLElement, state: MessageState, baseClass: string): void {
  disposeStateBinding(state);
  if (state.timer) {
    window.clearTimeout(state.timer);
    state.timer = undefined;
  }

  if (baseClass.length > 0) {
    element.className = baseClass;
  } else {
    element.className = '';
  }

  if (element.dataset.i18n) {
    delete element.dataset.i18n;
  }
  element.textContent = '';
}

function updateMessageContent(element: HTMLElement, content: MessageContent, state: MessageState): void {
  disposeStateBinding(state);
  state.binding = bindLocalizedText(element, content);
}

function disposeStateBinding(state: MessageState): void {
  if (state.binding) {
    state.binding.dispose();
    state.binding = null;
  }
}

function ensureMessageAccessibility(element: HTMLElement): void {
  if (!element.hasAttribute('role')) {
    element.setAttribute('role', 'status');
  }
  if (!element.hasAttribute('aria-live')) {
    element.setAttribute('aria-live', 'polite');
  }
}
