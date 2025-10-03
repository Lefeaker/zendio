import type { Messages } from '../../i18n/locales';
import { getElementById } from '../utils/dom';
import { OptionsValidationError } from '../services/validation';
import { ConfigTransferError } from '../services/configTransfer';

type MessageType = 'success' | 'error';

let transferMessageTimer: number | undefined;
let statusMessageTimer: number | undefined;

export function showTransferMessage(type: MessageType, text: string): void {
  const element = getElementById<HTMLSpanElement>('configTransferMsg');
  element.textContent = text;
  element.className = type === 'success' ? 'message success' : 'message error';

  if (transferMessageTimer) {
    window.clearTimeout(transferMessageTimer);
  }

  transferMessageTimer = window.setTimeout(() => {
    element.textContent = '';
    element.className = 'message';
    transferMessageTimer = undefined;
  }, 2500);
}

export function clearTransferMessage(): void {
  const element = getElementById<HTMLSpanElement>('configTransferMsg');
  element.textContent = '';
  element.className = 'message';

  if (transferMessageTimer) {
    window.clearTimeout(transferMessageTimer);
    transferMessageTimer = undefined;
  }
}

export function showStatusMessage(type: MessageType, text: string): void {
  const element = getElementById<HTMLSpanElement>('msg');
  element.textContent = text;
  element.className = type === 'success' ? 'message success' : 'message error';

  if (statusMessageTimer) {
    window.clearTimeout(statusMessageTimer);
  }

  statusMessageTimer = window.setTimeout(() => {
    element.textContent = '';
    element.className = '';
    statusMessageTimer = undefined;
  }, 2000);
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
