import type { CompleteOptions, StoredOptions } from '../../shared/types/options';

export type ConfigTransferErrorCode =
  | 'EMPTY_IMPORT'
  | 'PARSE_FAILED'
  | 'CLIPBOARD_UNAVAILABLE'
  | 'CLIPBOARD_READ_UNAVAILABLE';

export class ConfigTransferError extends Error {
  readonly code: ConfigTransferErrorCode;
  readonly detail?: string;

  constructor(code: ConfigTransferErrorCode, detail?: string) {
    super(code);
    this.name = 'ConfigTransferError';
    this.code = code;
    this.detail = detail;
  }
}

export async function copyOptionsToClipboard(options: StoredOptions | CompleteOptions): Promise<void> {
  const jsonText = JSON.stringify(options, null, 2);
  await writeToClipboard(jsonText);
}

export async function writeToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const success = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!success) {
    throw new ConfigTransferError('CLIPBOARD_UNAVAILABLE');
  }
}

export async function readConfigTextFromClipboard(): Promise<string> {
  if (navigator.clipboard && navigator.clipboard.readText) {
    return navigator.clipboard.readText();
  }
  throw new ConfigTransferError('CLIPBOARD_READ_UNAVAILABLE');
}

export function parseConfigInput(raw: string): StoredOptions {
  const textValue = (raw || '').trim();
  if (!textValue) {
    throw new ConfigTransferError('EMPTY_IMPORT');
  }

  try {
    const parsed = JSON.parse(textValue);
    if (typeof parsed !== 'object' || parsed === null) {
      throw new ConfigTransferError('PARSE_FAILED');
    }
    return parsed as StoredOptions;
  } catch (error) {
    if (error instanceof ConfigTransferError) {
      throw error;
    }
    const detail = error instanceof Error ? error.message : undefined;
    throw new ConfigTransferError('PARSE_FAILED', detail);
  }
}
