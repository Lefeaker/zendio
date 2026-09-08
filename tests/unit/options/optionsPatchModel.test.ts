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

function nestPath(path: readonly string[], value: unknown): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  let owner = result;
  path.forEach((part, index) => {
    if (index === path.length - 1) {
      owner[part] = value;
      return;
    }
    const child: Record<string, unknown> = {};
    owner[part] = child;
    owner = child;
  });
  return result;
}

describe.each(cloneModes)('optionsPatchModel with $mode', ({ native }) => {
  beforeEach(() => {
    vi.stubGlobal('structuredClone', native ? nativeClone : undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the complete 56-path inventory with fixed screenshot leaf ownership', () => {
    const keys = OPTIONS_PATCH_PATHS.map(optionsPathKey);
    expect(keys).toHaveLength(56);
    expect(new Set(keys).size).toBe(56);
    expect(keys.filter((key) => key.startsWith('video.screenshotAttachment'))).toEqual([
      'video.screenshotAttachment.locationTemplate',
      'video.screenshotAttachment.fileNameTemplate',
      'video.screenshotAttachment.markdownUrlFormat'
    ]);
    expect(OPTIONS_PATCH_PATHS.every((path) => path.length >= 1 && path.length <= 3)).toBe(true);
  });

  it.each(OPTIONS_PATCH_PATHS.map((path) => ({ path, key: optionsPathKey(path) })))(
    'reads, replaces, projects and deletes $key without supplying defaults',
    ({ path }) => {
      const source: StoredOptions = {};
      const value = { nested: { keep: 1 }, ownUndefined: undefined };
      const next = replaceOptionsPath(source, path, value);
      expect(next).toStrictEqual(nestPath(path, value));
      expect(source).toStrictEqual({});
      expect(readOptionsPath(source, path)).toBeUndefined();
      expect(readOptionsPath(next, path)).toStrictEqual(value);
      expect(readOptionsPath(next, path)).not.toBe(value);
      expect(diffOptionsPaths(source, next)).toEqual([path]);
      expect(diffOptionsPaths(null, next)).toEqual([path]);
      const deleted = replaceOptionsPath(next, path, undefined);
      const emptyLeafOwner = path.length === 1 ? {} : nestPath(path.slice(0, -1), {});
      expect(deleted).toStrictEqual(emptyLeafOwner);
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

  it('replaces one screenshot leaf while preserving its independently owned siblings', () => {
    const initial: StoredOptions = {
      video: {
        screenshotAttachment: {
          locationTemplate: './assets/before',
          fileNameTemplate: 'before.jpg',
          markdownUrlFormat: '![]({path})'
        }
      }
    };
    const result = replaceOptionsPath(
      initial,
      ['video', 'screenshotAttachment', 'locationTemplate'],
      './assets/after'
    );
    expect(result.video?.screenshotAttachment).toStrictEqual({
      locationTemplate: './assets/after',
      fileNameTemplate: 'before.jpg',
      markdownUrlFormat: '![]({path})'
    });
    expect(diffOptionsPaths(initial, result)).toEqual([
      ['video', 'screenshotAttachment', 'locationTemplate']
    ]);
  });

  it('keeps dynamic and invariant-bearing editors on their registered aggregate paths', () => {
    const aggregateKeys = [
      'domainMappings',
      'vaultRouter',
      'yamlConfig',
      'classifier.taxonomy',
      'fragmentClipper.selectionModifierKeys',
      'video.promptPosition'
    ];
    const keys = OPTIONS_PATCH_PATHS.map(optionsPathKey);
    expect(aggregateKeys.every((key) => keys.includes(key))).toBe(true);
    expect(keys).not.toEqual(
      expect.arrayContaining([
        'domainMappings.example.com',
        'vaultRouter.vaults.0',
        'yamlConfig.contentTypes.article.fields.0',
        'classifier.taxonomy.categories.0',
        'fragmentClipper.selectionModifierKeys.0',
        'video.promptPosition.x'
      ])
    );
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
