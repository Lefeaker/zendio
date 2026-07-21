import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
  measurePlainStructuredData,
  parseBoundedJson,
  plainStructuredDataEqual,
  snapshotPlainStructuredData,
  type PlainStructuredObject,
  type PlainStructuredValue
} from '@shared/config/losslessObjectBoundary';
import {
  STORED_OPTIONS_KNOWN_ROOTS,
  createStoredOptionsBoundaryIssue,
  createStoredOptionsPatchIssue,
  createStoredOptionsSchemaIssue,
  createStrippedStoredOptionsIssue,
  createUnknownStoredOptionsRootIssue,
  issuesFromZod
} from '@shared/config/storedOptionsIssues';

function expectFailure(
  result: ReturnType<typeof snapshotPlainStructuredData>,
  code: Exclude<typeof result, { ok: true }>['code']
): void {
  expect(result).toEqual({ ok: false, code });
}

function expectStructuredObject(value: PlainStructuredValue): PlainStructuredObject {
  expect(value).toBeTypeOf('object');
  expect(value).not.toBeNull();
  expect(Array.isArray(value)).toBe(false);
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Expected a plain structured object.');
  }
  return value;
}

function expectStructuredArray(value: PlainStructuredValue): PlainStructuredValue[] {
  expect(Array.isArray(value)).toBe(true);
  if (!Array.isArray(value)) throw new Error('Expected a plain structured array.');
  return value;
}

describe('lossless plain structured-data boundary', () => {
  it('clones finite JSON data without retaining source objects', () => {
    const nullPrototypeChild: PlainStructuredObject = { active: true };
    Object.setPrototypeOf(nullPrototypeChild, null);
    const source = {
      nil: null,
      count: 3.5,
      title: 'Zendio',
      nested: nullPrototypeChild,
      rows: [{ id: 'a' }, '二']
    };

    const result = snapshotPlainStructuredData(source);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toEqual(source);
    expect(result.value).not.toBe(source);
    expect(Object.getPrototypeOf(result.value)).toBeNull();
    const value = expectStructuredObject(result.value);
    const nested = expectStructuredObject(value.nested ?? null);
    const rows = expectStructuredArray(value.rows ?? null);
    expect(Object.getPrototypeOf(nested)).toBeNull();
    expect(Object.getPrototypeOf(expectStructuredObject(rows[0] ?? null))).toBeNull();
    expect(result.measurement).toEqual({
      nodes: 10,
      depth: 3,
      utf8Bytes: new TextEncoder().encode(JSON.stringify(source)).byteLength
    });

    nullPrototypeChild.active = false;
    expect(nested.active).toBe(true);
  });

  it('defines __proto__ as inert own data on a null-prototype clone', () => {
    const result = parseBoundedJson('{"__proto__":{"polluted":true}}');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const value = expectStructuredObject(result.value);
    expect(Object.getPrototypeOf(value)).toBeNull();
    expect(Object.prototype.hasOwnProperty.call(result.value, '__proto__')).toBe(true);
    expect(value.__proto__).toEqual({ polluted: true });
    expect({}).not.toHaveProperty('polluted');
  });

  it('allows repeated acyclic references and snapshots each occurrence', () => {
    const shared = { value: 'same' };
    const result = snapshotPlainStructuredData({ first: shared, second: shared });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const value = expectStructuredObject(result.value);
    const first = expectStructuredObject(value.first ?? null);
    const second = expectStructuredObject(value.second ?? null);
    expect(first).toEqual(second);
    expect(first).not.toBe(second);
  });

  it.each([
    [undefined, 'UNSUPPORTED_TYPE'],
    [1n, 'UNSUPPORTED_TYPE'],
    [Symbol('value'), 'UNSUPPORTED_TYPE'],
    [() => undefined, 'UNSUPPORTED_TYPE'],
    [Number.NaN, 'NON_FINITE_NUMBER'],
    [Number.POSITIVE_INFINITY, 'NON_FINITE_NUMBER']
  ] as const)('rejects unsupported primitive %s', (value, code) => {
    expectFailure(snapshotPlainStructuredData(value), code);
  });

  it.each([new Date(), new Map(), Object.create({ inherited: true })])(
    'rejects unsupported object prototypes',
    (value) => {
      expectFailure(snapshotPlainStructuredData(value), 'UNSUPPORTED_PROTOTYPE');
    }
  );

  it('rejects symbol keys and never invokes accessors', () => {
    const symbolRecord = { safe: true, [Symbol('private')]: 'secret' };
    expectFailure(snapshotPlainStructuredData(symbolRecord), 'SYMBOL_KEY');

    const getter = vi.fn(() => 'api-key-secret');
    const accessorRecord = Object.defineProperty({}, 'apiKey', {
      enumerable: true,
      get: getter
    });
    expectFailure(snapshotPlainStructuredData(accessorRecord), 'ACCESSOR_PROPERTY');
    expect(getter).not.toHaveBeenCalled();
  });

  it('rejects non-enumerable object data rather than silently changing JSON shape', () => {
    const source = Object.defineProperty({}, 'hidden', {
      enumerable: false,
      value: 'private-value'
    });
    expectFailure(snapshotPlainStructuredData(source), 'UNSUPPORTED_DESCRIPTOR');
  });

  it('rejects cycles but not shared siblings', () => {
    const objectCycle: PlainStructuredObject = {};
    objectCycle.self = objectCycle;
    expectFailure(snapshotPlainStructuredData(objectCycle), 'CYCLE');

    const arrayCycle: PlainStructuredValue[] = [];
    arrayCycle.push(arrayCycle);
    expectFailure(snapshotPlainStructuredData(arrayCycle), 'CYCLE');
  });

  it('rejects sparse arrays, extra properties, and accessor indices', () => {
    const sparse = new Array(2);
    sparse[1] = 'present';
    expectFailure(snapshotPlainStructuredData(sparse), 'SPARSE_ARRAY');

    const extra = Object.assign(['dense'], { label: 'not-json-array-data' });
    expectFailure(snapshotPlainStructuredData(extra), 'EXTRA_ARRAY_PROPERTY');

    const accessor = ['safe'];
    Object.defineProperty(accessor, '0', { enumerable: true, get: () => 'unsafe' });
    expectFailure(snapshotPlainStructuredData(accessor), 'ACCESSOR_PROPERTY');
  });

  it.each([
    [
      new Proxy(
        {},
        {
          getPrototypeOf() {
            throw new Error('prototype secret');
          }
        }
      ),
      'PROTOTYPE_TRAP'
    ],
    [
      new Proxy(
        {},
        {
          ownKeys() {
            throw new Error('key secret');
          }
        }
      ),
      'KEY_TRAP'
    ],
    [
      new Proxy(
        { field: true },
        {
          getOwnPropertyDescriptor() {
            throw new Error('descriptor secret');
          }
        }
      ),
      'DESCRIPTOR_TRAP'
    ]
  ] as const)('fails closed when a proxy inspection trap throws', (value, code) => {
    expectFailure(snapshotPlainStructuredData(value), code);
  });

  it('enforces depth, node, and exact JSON UTF-8 byte budgets', () => {
    expectFailure(snapshotPlainStructuredData({ child: {} }, { maxDepth: 0 }), 'MAX_DEPTH');
    expectFailure(snapshotPlainStructuredData([1, 2], { maxNodes: 2 }), 'MAX_NODES');

    const measured = measurePlainStructuredData({ text: '二\n"' });
    expect(measured.ok).toBe(true);
    if (!measured.ok) return;
    const exactBytes = new TextEncoder().encode(JSON.stringify({ text: '二\n"' })).byteLength;
    expect(measured.measurement.utf8Bytes).toBe(exactBytes);
    expectFailure(
      snapshotPlainStructuredData({ text: '二\n"' }, { maxUtf8Bytes: exactBytes - 1 }),
      'MAX_UTF8_BYTES'
    );
  });

  it('rejects invalid or unsafe caller limits before inspecting input', () => {
    const ownKeys = vi.fn<() => (string | symbol)[]>(() => []);
    const value = new Proxy({}, { ownKeys });
    expectFailure(snapshotPlainStructuredData(value, { maxNodes: -1 }), 'INVALID_LIMITS');
    expect(ownKeys).not.toHaveBeenCalled();
  });

  it('bounds text by UTF-8 bytes before calling native JSON.parse', () => {
    const parse = vi.spyOn(JSON, 'parse');
    const result = parseBoundedJson('{"value":"二"}', { maxUtf8Bytes: 8 });

    expect(result).toEqual({ ok: false, code: 'MAX_UTF8_BYTES' });
    expect(parse).not.toHaveBeenCalled();
    parse.mockRestore();
  });

  it('uses native JSON parsing, then returns the same bounded snapshot contract', () => {
    const parsed = parseBoundedJson('{"rows":[1,true,null]}');
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value).toEqual({ rows: [1, true, null] });
      expect(Object.getPrototypeOf(expectStructuredObject(parsed.value))).toBeNull();
    }
    expect(parseBoundedJson('{invalid')).toEqual({ ok: false, code: 'INVALID_JSON' });
  });

  it('compares bounded structures without depending on object key order', () => {
    expect(plainStructuredDataEqual({ a: 1, b: [true] }, { b: [true], a: 1 })).toEqual({
      ok: true,
      equal: true
    });
    expect(plainStructuredDataEqual({ a: 1 }, { a: 2 })).toEqual({
      ok: true,
      equal: false
    });
    expect(plainStructuredDataEqual(-0, 0)).toEqual({ ok: true, equal: false });
    expect(plainStructuredDataEqual({ deep: {} }, {}, { maxDepth: 0 })).toEqual({
      ok: false,
      code: 'MAX_DEPTH'
    });
  });
});

describe('stored options redacted issues', () => {
  it('publishes the exact known root taxonomy', () => {
    expect(STORED_OPTIONS_KNOWN_ROOTS).toEqual([
      'interfaceTheme',
      'rest',
      'templates',
      'domainMappings',
      'aiChat',
      'deepResearch',
      'fragmentClipper',
      'readingSession',
      'video',
      'classifier',
      'experimentalAi',
      'pageSummary',
      'readingOverlaySummary',
      'subtitleTranslation',
      'privacyPreferences',
      'vaultRouter',
      'yamlConfig'
    ]);
  });

  it('emits only stable codes, known sections, and redacted paths', () => {
    const boundaryFailure = snapshotPlainStructuredData(Symbol('api-key-value'));
    expect(boundaryFailure.ok).toBe(false);
    if (boundaryFailure.ok) return;

    expect(createStoredOptionsBoundaryIssue('classifier', boundaryFailure, true)).toEqual({
      code: 'BOUNDARY_UNSUPPORTED_TYPE',
      section: 'classifier',
      path: '$.classifier.<redacted>'
    });
    expect(createStoredOptionsSchemaIssue('rest', true)).toEqual({
      code: 'SCHEMA_INVALID',
      section: 'rest',
      path: '$.rest.<redacted>'
    });
    expect(createUnknownStoredOptionsRootIssue()).toEqual({
      code: 'UNKNOWN_ROOT',
      section: 'root',
      path: '$.<redacted>'
    });
    expect(createStrippedStoredOptionsIssue('yamlConfig')).toEqual({
      code: 'FIELD_STRIPPED',
      section: 'yamlConfig',
      path: '$.yamlConfig.<redacted>'
    });
    expect(createStoredOptionsPatchIssue('video', true)).toEqual({
      code: 'PATCH_INVALID',
      section: 'video',
      path: '$.video.<redacted>'
    });
  });

  it('never forwards Zod messages, values, API keys, or arbitrary taxonomy map keys', () => {
    const schema = z.object({
      taxonomy: z.record(
        z.string(),
        z.object({ apiKey: z.string().min(10, 'api-key-secret-message') })
      )
    });
    const parsed = schema.safeParse({
      taxonomy: { 'private-taxonomy-map-key': { apiKey: 'secret' } }
    });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;

    const issues = issuesFromZod('classifier', parsed.error);
    expect(issues).toEqual([
      {
        code: 'SCHEMA_INVALID',
        section: 'classifier',
        path: '$.classifier.<redacted>'
      }
    ]);
    const serialized = JSON.stringify(issues);
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('apiKey');
    expect(serialized).not.toContain('private-taxonomy-map-key');
  });
});
