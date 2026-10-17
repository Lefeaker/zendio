import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { auditRuntimeRegistryBuildOutput } from '../../../scripts/utils/runtimeRegistryBuildOutput.mjs';

const roots: string[] = [];
function fixture(overrides: Record<string, string | null> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'zendio-runtime-build-'));
  roots.push(root);
  const chunks = join(root, 'chunks');
  mkdirSync(chunks);
  const files = {
    'aiChatExtractor-ONE.js': 'import { common } from "./chunk-shared.js";',
    'chunk-shared.js': 'export const common = 1;',
    'runtimeRegistry-ONE.js': 'const load = () => import("./runtimePlatformParsers-ONE.js");',
    'runtimePlatformParsers-ONE.js': 'const chatgptParser = {};',
    ...overrides
  };
  for (const [file, source] of Object.entries(files)) {
    if (source !== null) writeFileSync(join(chunks, file), source);
  }
  return chunks;
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('runtime AI parser build contract', () => {
  it('accepts one lazy parser boundary with a clean extractor static graph', () => {
    expect(auditRuntimeRegistryBuildOutput(fixture())).toEqual([]);
  });

  it('fails for missing build output instead of skipping', () => {
    const chunks = fixture();
    rmSync(chunks, { recursive: true });
    expect(auditRuntimeRegistryBuildOutput(chunks)).toEqual([
      'Missing build chunks directory; run a build first.'
    ]);
  });

  it.each(['aiChatExtractor', 'runtimeRegistry', 'runtimePlatformParsers'])(
    'rejects missing or duplicate %s output',
    (prefix) => {
      expect(auditRuntimeRegistryBuildOutput(fixture({ [`${prefix}-ONE.js`]: null }))).toContain(
        `Expected exactly one ${prefix} chunk; found 0.`
      );
      expect(auditRuntimeRegistryBuildOutput(fixture({ [`${prefix}-TWO.js`]: 'extra' }))).toContain(
        `Expected exactly one ${prefix} chunk; found 2.`
      );
    }
  );

  it.each([
    'chatgptParser',
    'claudeParser',
    'geminiParser',
    'kimiParser',
    'perplexityParser',
    'runtimePlatformParsers',
    'id:"chatgpt",parse',
    'id:"claude",parse',
    'id:"gemini",parse',
    'id:"kimi",aliases:["moonshot"]',
    'id:"perplexity",aliases:["pplx"]'
  ])('detects %s in a transitive static dependency', (marker) => {
    const chunks = fixture({ 'chunk-shared.js': `const implementation = '${marker}';` });
    expect(auditRuntimeRegistryBuildOutput(chunks)).toContain(
      `chunk-shared.js: eager platform parser marker ${marker}.`
    );
  });

  it('rejects eager parsers and broken static dependencies', () => {
    expect(
      auditRuntimeRegistryBuildOutput(
        fixture({
          'chunk-shared.js': 'import "./runtimePlatformParsers-ONE.js"; import "./missing.js";'
        })
      )
    ).toEqual(
      expect.arrayContaining([
        'runtimePlatformParsers-ONE.js: eagerly imported parser chunk.',
        'Missing static dependency chunk: missing.js.'
      ])
    );
  });

  it.each([
    'export const load = 1;',
    'const load = () => import("./runtimePlatformParsers-MISSING.js");',
    'const load = () => import("./runtimePlatformParsers-ONE.js"); import "./runtimePlatformParsers-ONE.js";'
  ])('rejects a missing, wrong or static registry boundary', (source) => {
    expect(
      auditRuntimeRegistryBuildOutput(fixture({ 'runtimeRegistry-ONE.js': source }))
    ).not.toEqual([]);
  });
});
