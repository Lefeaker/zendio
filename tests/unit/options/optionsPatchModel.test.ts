import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { STORED_OPTIONS_DELETE } from '@shared/config/storedOptionsCodec';
import type { StoredOptions } from '@shared/types/options';
import {
  OPTIONS_PATCH_PATHS,
  areOptionsSnapshotsEqual,
  createOptionsPatch,
  diffOptionsPaths,
  optionsPathKey,
  readOptionsPath,
  replaceOptionsPath
} from '@options/state/optionsPatchModel';

const nativeClone = globalThis.structuredClone;
const cloneModes = [
  { mode: 'native structuredClone', native: true },
  { mode: 'existing fallback', native: false }
];

describe.each(cloneModes)('optionsPatchModel with $mode', ({ native }) => {
  beforeEach(() => {
    vi.stubGlobal('structuredClone', native ? nativeClone : undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the complete 54-path inventory with whole screenshot attachment ownership', () => {
    const keys = OPTIONS_PATCH_PATHS.map(optionsPathKey);
    expect(keys).toHaveLength(54);
    expect(new Set(keys).size).toBe(54);
    expect(keys.filter((key) => key.startsWith('video.screenshotAttachment'))).toEqual([
      'video.screenshotAttachment'
    ]);
    expect(OPTIONS_PATCH_PATHS.every((path) => path.length === 1 || path.length === 2)).toBe(true);
  });

  it.each(OPTIONS_PATCH_PATHS.map((path) => ({ path, key: optionsPathKey(path) })))(
    'reads, replaces, projects and deletes $key without supplying defaults',
    ({ path }) => {
      const source: StoredOptions = {};
      const value = { nested: { keep: 1 }, ownUndefined: undefined };
      const next = replaceOptionsPath(source, path, value);
      const [root, field] = path;
      expect(next).toStrictEqual({ [root]: field === undefined ? value : { [field]: value } });
      expect(source).toStrictEqual({});
      expect(readOptionsPath(source, path)).toBeUndefined();
      expect(readOptionsPath(next, path)).toStrictEqual(value);
      expect(readOptionsPath(next, path)).not.toBe(value);
      expect(diffOptionsPaths(source, next)).toEqual([path]);
      expect(diffOptionsPaths(null, next)).toEqual([path]);
      const deleted = replaceOptionsPath(next, path, undefined);
      expect(deleted).toStrictEqual(field === undefined ? {} : { [root]: {} });
      expect(readOptionsPath(deleted, path)).toBeUndefined();
      expect(createOptionsPatch(path, undefined)).toEqual({ path, value: STORED_OPTIONS_DELETE });
    }
  );

  it('preserves extension siblings, own undefined and generic snapshot typing', () => {
    const source: StoredOptions & {
      futureExtension: { keep: number };
      ownUndefined: undefined;
      rest: { apiKey: string; futureNested: number; ownUndefined: undefined };
    } = {
      rest: { apiKey: 'before', futureNested: 7, ownUndefined: undefined },
      futureExtension: { keep: 1 },
      ownUndefined: undefined
    };
    const result: typeof source = replaceOptionsPath(source, ['rest', 'apiKey'], 'after');
    const retained: number = result.futureExtension.keep;
    expect(retained).toBe(1);
    expect(result).toStrictEqual({ ...source, rest: { ...source.rest, apiKey: 'after' } });
    expect(result.futureExtension).not.toBe(source.futureExtension);
    expect(Object.prototype.hasOwnProperty.call(result, 'ownUndefined')).toBe(true);
    expect(Object.prototype.hasOwnProperty.call(result.rest, 'ownUndefined')).toBe(true);
    expect(source.rest.apiKey).toBe('before');
  });

  it('keeps deletion absent and distinguishes an own undefined property from absence', () => {
    const source: StoredOptions = { interfaceTheme: 'dark' };
    expect(replaceOptionsPath(source, ['interfaceTheme'], undefined)).toStrictEqual({});
    expect(source.interfaceTheme).toBe('dark');
    expect(areOptionsSnapshotsEqual({}, { interfaceTheme: undefined })).toBe(false);
    expect(() => diffOptionsPaths({}, { interfaceTheme: undefined })).toThrowError(
      'UNREGISTERED_OPTIONS_DRAFT_PATH'
    );
  });

  it('clones frozen sources and replacement arrays while retaining sparse holes', () => {
    const source = Object.freeze({ rest: Object.freeze({ apiKey: 'before' }) });
    const replacement = new Array<number | undefined | { keep: number }>(4);
    replacement[0] = 1;
    replacement[2] = undefined;
    replacement[3] = { keep: 2 };
    const result = replaceOptionsPath(source, ['rest', 'apiKey'], replacement);
    const copied = readOptionsPath(result, ['rest', 'apiKey']);
    expect(copied).toStrictEqual(replacement);
    expect(copied).not.toBe(replacement);
    expect(source.rest.apiKey).toBe('before');
    if (Array.isArray(copied)) {
      expect(Object.prototype.hasOwnProperty.call(copied, 1)).toBe(false);
      expect(Object.prototype.hasOwnProperty.call(copied, 2)).toBe(true);
      expect(copied[3]).not.toBe(replacement[3]);
    } else {
      throw new Error('Expected cloned sparse array');
    }
  });

  it('replaces the complete screenshot attachment without merging old fields', () => {
    const source: StoredOptions = {};
    const initial = replaceOptionsPath(source, ['video', 'screenshotAttachment'], {
      location: 'old',
      futureField: true
    });
    const replacement = { location: 'new' };
    const result = replaceOptionsPath(initial, ['video', 'screenshotAttachment'], replacement);
    expect(result).toStrictEqual({ video: { screenshotAttachment: replacement } });
    expect(readOptionsPath(result, ['video', 'screenshotAttachment'])).not.toBe(replacement);
    expect(diffOptionsPaths(initial, result)).toEqual([['video', 'screenshotAttachment']]);
  });

  it('rejects unregistered extension changes at the original projection boundary', () => {
    const before: StoredOptions & { futureExtension: { keep: number } } = {
      futureExtension: { keep: 1 }
    };
    const after = { ...before, futureExtension: { keep: 2 } };
    expect(() => diffOptionsPaths(before, after)).toThrowError('UNREGISTERED_OPTIONS_DRAFT_PATH');
    expect(areOptionsSnapshotsEqual(before, after)).toBe(false);
    expect(readOptionsPath(null, ['rest', 'apiKey'])).toBeUndefined();
    expect(readOptionsPath({}, ['toString'])).toBeUndefined();
  });

  it('packages invalid draft values and raw YAML before save-time sanitation', () => {
    const rawYaml = {
      contentTypes: {
        article: { fields: [{ name: '', type: 'text', enabled: 'true' }] }
      }
    };
    expect(createOptionsPatch(['interfaceTheme'], 'not-a-theme')).toEqual({
      path: ['interfaceTheme'],
      value: 'not-a-theme'
    });
    const patch = createOptionsPatch(['yamlConfig'], rawYaml);
    expect(patch).toStrictEqual({ path: ['yamlConfig'], value: rawYaml });
    expect(patch.value).not.toBe(rawYaml);
    expect(replaceOptionsPath({}, ['yamlConfig'], rawYaml)).toStrictEqual({ yamlConfig: rawYaml });
  });

  it.each([null, false, 0, NaN, Infinity, '', 5n])('retains raw primitive value %s', (value) => {
    expect(
      readOptionsPath(replaceOptionsPath({}, ['interfaceTheme'], value), ['interfaceTheme'])
    ).toBe(value);
    expect(createOptionsPatch(['interfaceTheme'], value).value).toBe(value);
  });

  it.each([
    {
      label: 'function',
      value: function draftFunction(this: void) {
        return 'draft';
      }
    },
    { label: 'symbol', value: Symbol.for('options-draft-value') }
  ])('preserves clone behavior for unsupported $label values', ({ value }) => {
    const source: StoredOptions & { futureExtension: typeof value } = { futureExtension: value };
    if (native) {
      expect(() => replaceOptionsPath({}, ['interfaceTheme'], value)).toThrowError(
        /could not be cloned/
      );
      expect(() => createOptionsPatch(['interfaceTheme'], value)).toThrowError(
        /could not be cloned/
      );
      expect(() => replaceOptionsPath(source, ['rest', 'apiKey'], 'after')).toThrowError(
        /could not be cloned/
      );
    } else {
      expect(
        readOptionsPath(replaceOptionsPath({}, ['interfaceTheme'], value), ['interfaceTheme'])
      ).toBe(value);
      expect(createOptionsPatch(['interfaceTheme'], value).value).toBe(value);
      const result = replaceOptionsPath(source, ['rest', 'apiKey'], 'after');
      expect(result.futureExtension).toBe(value);
      expect(result).not.toBe(source);
    }
  });
});
