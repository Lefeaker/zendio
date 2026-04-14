/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  copyOptionsToClipboard,
  parseConfigInput,
  readConfigTextFromClipboard,
  writeToClipboard,
  ConfigTransferError
} from '@options/services/configTransfer';

declare global {
  // eslint-disable-next-line no-var
  var navigator: Navigator;
}

declare global {
  // eslint-disable-next-line no-var
  var navigator: Navigator;
}

let clipboardMocks: {
  writeText: ReturnType<typeof vi.fn>;
  readText: ReturnType<typeof vi.fn>;
} | null = null;

describe('configTransfer service', () => {
  beforeEach(() => {
    const clipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue('{"value":42}')
    };

    clipboardMocks = clipboard;
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        clipboard
      }
    });
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis as typeof globalThis & { navigator?: Navigator }, 'navigator');
    clipboardMocks = null;
  });

  it('copies transfer payload到剪贴板', async () => {
    const payload = {
      version: 1,
      options: { foo: 'bar' },
      analytics: {
        consent: {
          analytics: true,
          errorReporting: false
        },
        debugMode: true
      }
    };

    await copyOptionsToClipboard(payload);

    if (!clipboardMocks) {
      throw new Error('Clipboard writeText mock missing');
    }
    expect(clipboardMocks.writeText).toHaveBeenCalledTimes(1);
    const maybeWritten: unknown = clipboardMocks.writeText.mock.calls.at(-1)?.[0];
    if (typeof maybeWritten !== 'string') {
      throw new Error('Clipboard contents must be stringified JSON');
    }
    expect(JSON.parse(maybeWritten)).toEqual(payload);
  });

  it('reads configuration text from clipboard', async () => {
    const result = await readConfigTextFromClipboard();
    expect(result).toBe('{"value":42}');
    if (!clipboardMocks) {
      throw new Error('Clipboard readText mock missing');
    }
    expect(clipboardMocks.readText).toHaveBeenCalledTimes(1);
  });

  it('解析新版传输格式', () => {
    const text = '{"version":2,"options":{"rest":{"baseUrl":"https://example.com"}},"analytics":{"consent":{"analytics":true,"errorReporting":false},"debugMode":false}}';
    const parsed = parseConfigInput(text);
    expect(parsed.version).toBe(2);
    expect(parsed.options).toEqual({ rest: { baseUrl: 'https://example.com' } });
    expect(parsed.analytics).toEqual({
      consent: { analytics: true, errorReporting: false },
      debugMode: false
    });
  });

  it('兼容旧版仅包含选项的格式', () => {
    const text = '{"rest":{"baseUrl":"https://example.com"}}';
    const parsed = parseConfigInput(text);
    expect(parsed.version).toBe(0);
    expect(parsed.options).toEqual({ rest: { baseUrl: 'https://example.com' } });
    expect(parsed.analytics).toBeUndefined();
  });

  it('throws EMPTY_IMPORT for empty input', () => {
    expect(() => parseConfigInput('   ')).toThrowError(ConfigTransferError);
    try {
      parseConfigInput('   ');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigTransferError);
      expect((error as ConfigTransferError).code).toBe('EMPTY_IMPORT');
    }
  });

  it('throws PARSE_FAILED for invalid json', () => {
    expect(() => parseConfigInput('not json')).toThrowError(ConfigTransferError);
    try {
      parseConfigInput('not json');
    } catch (error) {
      expect(error).toBeInstanceOf(ConfigTransferError);
      expect((error as ConfigTransferError).code).toBe('PARSE_FAILED');
    }
  });


  it('falls back to document.execCommand when clipboard api is unavailable', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {}
    });
    document.body.innerHTML = '';
    const execCommandMock = vi.fn(() => true);
    document.execCommand = execCommandMock;

    await writeToClipboard('hello');

    expect(execCommandMock).toHaveBeenCalledWith('copy');
    expect(document.querySelector('textarea')).toBeNull();
  });

  it('throws clipboard-specific errors for unavailable read and failed copy fallback', async () => {
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {}
    });
    document.execCommand = vi.fn(() => false);

    await expect(writeToClipboard('hello')).rejects.toMatchObject({ code: 'CLIPBOARD_UNAVAILABLE' });
    await expect(readConfigTextFromClipboard()).rejects.toMatchObject({ code: 'CLIPBOARD_READ_UNAVAILABLE' });
  });

  it('defaults version to 1 and drops invalid analytics payloads', () => {
    const parsed = parseConfigInput('{"options":{"rest":{"baseUrl":"https://example.com"}},"analytics":{"debugMode":"nope","consent":"invalid"}}');
    expect(parsed.version).toBe(1);
    expect(parsed.analytics).toBeUndefined();
  });

});
