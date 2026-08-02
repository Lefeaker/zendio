import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const modulePath = pathToFileURL(resolve('tools/npm-audit-regression/canonical-json.mjs')).href;
const loadCanonicalJson = () => import(modulePath);

describe('canonical audit JSON', () => {
  it('sorts object keys recursively with two-space JSON and terminal LF', async () => {
    const { canonicalJsonBytes } = await loadCanonicalJson();
    expect(canonicalJsonBytes({ b: { z: 1, a: 2 }, a: 3 }).toString()).toBe(
      '{\n  "a": 3,\n  "b": {\n    "a": 2,\n    "z": 1\n  }\n}\n'
    );
  });

  it('keeps an independent single-primitive-array fixture formatter-stable', async () => {
    const { canonicalJsonBytes } = await loadCanonicalJson();
    expect(canonicalJsonBytes({ z: true, a: [''] }).toString()).toBe(
      '{\n  "a": [""],\n  "z": true\n}\n'
    );
  });

  it.each([
    ['root', '{"x":1,"x":1}', 'x'],
    ['nested object', '{"outer":{"x":1,"x":1}}', 'x'],
    ['array object', '[{"x":1,"x":1}]', 'x'],
    ['escaped equivalent', '{"x":1,"\\u0078":1}', 'x']
  ])('rejects duplicate keys at %s', async (_label, source, key) => {
    const { parseJsonBytesStrict } = await loadCanonicalJson();
    expect(() => parseJsonBytesStrict(Buffer.from(source))).toThrow(`JSON_DUPLICATE_KEY:${key}`);
  });

  it.each(['{"x":}', '{"x":1} trailing', '[1,]', '"unterminated'])(
    'rejects malformed JSON %s',
    async (source) => {
      const { parseJsonBytesStrict } = await loadCanonicalJson();
      expect(() => parseJsonBytesStrict(Buffer.from(source))).toThrow();
    }
  );

  it('rejects valid but noncanonical file bytes', async () => {
    const { canonicalJsonBytes, readCanonicalJsonFileBounded } = await loadCanonicalJson();
    const root = mkdtempSync(join(tmpdir(), 'zendio-canonical-'));
    const path = join(root, 'fixture.json');
    try {
      writeFileSync(path, '{"b":1,"a":2}\n');
      expect(() => readCanonicalJsonFileBounded(path)).toThrow('not exact canonical');
      writeFileSync(path, canonicalJsonBytes({ b: 1, a: 2 }));
      expect(readCanonicalJsonFileBounded(path)).toEqual({ a: 2, b: 1 });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('enforces independent depth-eight boundary at the exact edge and edge plus one', async () => {
    const { parseJsonBytesStrict } = await loadCanonicalJson();
    const nested = (depth: number) => {
      type Nested = string | { nested: Nested };
      let value: Nested = 'leaf';
      for (let index = 0; index < depth; index += 1) value = { nested: value };
      return Buffer.from(JSON.stringify(value));
    };
    expect(() => parseJsonBytesStrict(nested(8), { maximumDepth: 8 })).not.toThrow();
    expect(() => parseJsonBytesStrict(nested(9), { maximumDepth: 8 })).toThrow('depth exceeds');
  });

  it('enforces independent 512-byte key and 4096-byte string boundaries', async () => {
    const { assertPlainJson } = await loadCanonicalJson();
    expect(() =>
      assertPlainJson({ ['k'.repeat(512)]: 's'.repeat(4096) }, { path: 'edge' })
    ).not.toThrow();
    expect(() => assertPlainJson({ ['k'.repeat(513)]: '' }, { path: 'key-plus-one' })).toThrow(
      'Object key exceeds'
    );
    expect(() => assertPlainJson({ value: 's'.repeat(4097) }, { path: 'string-plus-one' })).toThrow(
      'String value exceeds'
    );
  });

  it('enforces bounded file bytes at exact limit and limit plus one', async () => {
    const { readFileBounded } = await loadCanonicalJson();
    const root = mkdtempSync(join(tmpdir(), 'zendio-bounded-file-'));
    const path = join(root, 'fixture');
    try {
      writeFileSync(path, 'x'.repeat(16));
      expect(readFileBounded(path, 16)).toEqual(Buffer.from('x'.repeat(16)));
      writeFileSync(path, 'x'.repeat(17));
      expect(() => readFileBounded(path, 16)).toThrow('exceeds limit');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
