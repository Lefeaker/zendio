import type { StoredOptions } from '../../shared/types/options';
import { encodeStoredOptionsReplacement } from '../../shared/config/storedOptionsCodec';
import { parseBoundedJson } from '../../shared/config/losslessObjectBoundary';
import { isObjectRecord, type ObjectRecord } from '../../shared/guards/object';
import type { AnalyticsTransferPayload } from './analyticsTransfer';

export interface ConfigTransferPayload {
  version: number;
  options: StoredOptions;
  analytics?: AnalyticsTransferPayload;
}

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
    // Fix exactOptionalPropertyTypes error by conditionally assigning detail
    if (detail !== undefined) {
      this.detail = detail;
    }
  }
}

export async function copyOptionsToClipboard(options: object): Promise<void> {
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

function isPlainObject(value: Parameters<typeof isObjectRecord>[0]): value is ObjectRecord {
  return isObjectRecord(value) && !Array.isArray(value);
}

function sanitizeImportedOptions(
  candidate: Parameters<typeof encodeStoredOptionsReplacement>[0]
): StoredOptions {
  const encoded = encodeStoredOptionsReplacement(candidate);
  if (!encoded.success) {
    throw new ConfigTransferError('PARSE_FAILED');
  }
  return encoded.value;
}

function parseAnalyticsPayload(
  candidate: ObjectRecord[string]
): AnalyticsTransferPayload | undefined {
  if (!isPlainObject(candidate)) {
    return undefined;
  }

  const payload: AnalyticsTransferPayload = {};

  const consentCandidate = candidate['consent'];
  if (isPlainObject(consentCandidate)) {
    const consent = consentCandidate;
    if (typeof consent.analytics === 'boolean' && typeof consent.errorReporting === 'boolean') {
      payload.consent = {
        analytics: consent.analytics,
        errorReporting: consent.errorReporting
      };
    }
  }

  const debugCandidate = candidate['debugMode'];
  if (typeof debugCandidate === 'boolean') {
    payload.debugMode = debugCandidate;
  }

  return payload.consent || typeof payload.debugMode === 'boolean' ? payload : undefined;
}

export function parseConfigInput(raw: string): ConfigTransferPayload {
  const textValue = raw || '';

  try {
    const boundary = parseBoundedJson(textValue);
    if (!boundary.ok) {
      if (boundary.code === 'INVALID_JSON' && !textValue.trim()) {
        throw new ConfigTransferError('EMPTY_IMPORT');
      }
      throw new ConfigTransferError('PARSE_FAILED');
    }
    if (!isPlainObject(boundary.value)) {
      throw new ConfigTransferError('PARSE_FAILED');
    }
    const parsed = boundary.value;

    if (Object.prototype.hasOwnProperty.call(parsed, 'options')) {
      if (!isPlainObject(parsed.options)) {
        throw new ConfigTransferError('PARSE_FAILED');
      }
      const version = typeof parsed.version === 'number' ? parsed.version : 1;
      const options = sanitizeImportedOptions(parsed.options);
      const analytics = parseAnalyticsPayload(parsed.analytics);
      return {
        version,
        options,
        ...(analytics !== undefined && { analytics })
      };
    }

    return {
      version: 0,
      options: sanitizeImportedOptions(parsed)
    };
  } catch (error) {
    if (error instanceof ConfigTransferError) {
      throw error;
    }
    throw new ConfigTransferError('PARSE_FAILED');
  }
}
