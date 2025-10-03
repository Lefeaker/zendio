import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  copyOptionsToClipboard,
  parseConfigInput,
  readConfigTextFromClipboard,
  ConfigTransferError
} from '../../src/options/services/configTransfer';

declare global {
  // eslint-disable-next-line no-var
  var navigator: Navigator;
}

describe('configTransfer service', () => {
  beforeEach(() => {
    const clipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
      readText: vi.fn().mockResolvedValue('{"value":42}')
    };

    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      value: {
        clipboard
      }
    });
  });

  afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
    delete globalThis.navigator;
  });

  it('copies options to clipboard as prettified JSON', async () => {
    const options = { foo: 'bar' } as unknown as Parameters<typeof copyOptionsToClipboard>[0];
    await copyOptionsToClipboard(options);

    const expected = `{
  "foo": "bar"
}`;
    expect(globalThis.navigator.clipboard?.writeText).toHaveBeenCalledWith(expected);
  });

  it('reads configuration text from clipboard', async () => {
    const result = await readConfigTextFromClipboard();
    expect(result).toBe('{"value":42}');
    expect(globalThis.navigator.clipboard?.readText).toHaveBeenCalledTimes(1);
  });

  it('parses valid JSON input into stored options', () => {
    const text = '{"rest":{"baseUrl":"https://example.com"}}';
    const parsed = parseConfigInput(text);
    expect(parsed).toEqual({ rest: { baseUrl: 'https://example.com' } });
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
});
