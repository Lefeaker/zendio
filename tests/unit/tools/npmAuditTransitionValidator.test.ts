import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCanonicalJson, loadTransitionValidator } from '../../utils/npmAuditTypedLoader.mjs';

const manifestPath = 'tools/npm-audit-regression/manifests/r02-transition-v10.json';
const expectedManifestSha256 = 'e0af57ea02d4244a8969154ff1e1b975085fb433163b5d946fce38e4ff863143';
const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

describe('portable R02 transition manifest', () => {
  it('keeps transition validation pure and delegates Git bytes to its caller', () => {
    const source = readFileSync('tools/npm-audit-regression/transition-validator.mjs', 'utf8');
    expect(source).not.toContain('node:child_process');
    expect(source).not.toMatch(/\b(?:spawn|execFile)Sync?\b/u);
    expect(source).not.toContain('git show');
  });

  it('binds the accepted corrected-R01 base and portable runtime policy', async () => {
    const { R02_TRANSITION_ARTIFACT_SHA256, getR02ImmutableTransition } =
      await loadTransitionValidator();
    const transition = getR02ImmutableTransition();
    expect(transition.schema).toEqual({
      name: 'r02-transition-v10',
      version: 10,
      rejectUnknownFields: true,
      rejectDuplicateFields: true
    });
    expect(transition.base.head).toBe('e190bdc2fea559c8a3e90bb7220286de2595a754');
    expect(transition.runtime).not.toHaveProperty('nodePath');
    expect(transition.runtime).not.toHaveProperty('npmPath');
    expect(R02_TRANSITION_ARTIFACT_SHA256).toBe(expectedManifestSha256);
    expect(sha256(readFileSync(manifestPath))).toBe(expectedManifestSha256);
  });

  it('rejects duplicate, unknown, noncanonical, whole-digest, and semantic-digest mutations at their exact layer', async () => {
    const { loadTransitionManifest } = await loadTransitionValidator();
    const { canonicalJsonBytes } = await loadCanonicalJson();
    const root = mkdtempSync(join(tmpdir(), 'zendio-transition-'));
    const original = readFileSync(manifestPath);
    try {
      const duplicatePath = join(root, 'duplicate.json');
      const duplicate = original
        .toString('utf8')
        .replace(
          '"nodeVersion": "v20.20.2",',
          '"nodeVersion": "v20.20.2",\n    "nodeVersion": "v20.20.2",'
        );
      writeFileSync(duplicatePath, duplicate);
      expect(() => loadTransitionManifest(duplicatePath, sha256(Buffer.from(duplicate)))).toThrow(
        'JSON_DUPLICATE_KEY:nodeVersion'
      );

      const parsed = structuredClone(loadTransitionManifest(manifestPath, expectedManifestSha256));
      const unknownPath = join(root, 'unknown.json');
      parsed.runtime.extra = true;
      const unknown = canonicalJsonBytes(parsed);
      writeFileSync(unknownPath, unknown);
      expect(() => loadTransitionManifest(unknownPath, sha256(unknown))).toThrow(
        'TRANSITION_SCHEMA_MISMATCH:runtime'
      );

      const noncanonicalPath = join(root, 'noncanonical.json');
      writeFileSync(
        noncanonicalPath,
        Buffer.from(JSON.stringify(JSON.parse(original.toString('utf8'))))
      );
      expect(() =>
        loadTransitionManifest(noncanonicalPath, sha256(readFileSync(noncanonicalPath)))
      ).toThrow('TRANSITION_NONCANONICAL_BYTES');

      const wholePath = join(root, 'whole.json');
      writeFileSync(wholePath, original);
      expect(() => loadTransitionManifest(wholePath, '0'.repeat(64))).toThrow(
        'TRANSITION_WHOLE_DIGEST_MISMATCH'
      );

      const semanticPath = join(root, 'semantic.json');
      const semantic = structuredClone(
        loadTransitionManifest(manifestPath, expectedManifestSha256)
      );
      semantic.internalDigest = '0'.repeat(64);
      const semanticBytes = canonicalJsonBytes(semantic);
      writeFileSync(semanticPath, semanticBytes);
      expect(() => loadTransitionManifest(semanticPath, sha256(semanticBytes))).toThrow(
        'TRANSITION_SEMANTIC_DIGEST_MISMATCH'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('rejects the full nested row, relation, depth, and 64 KiB mutation families', async () => {
    const { loadTransitionManifest } = await loadTransitionValidator();
    const { canonicalJsonBytes } = await loadCanonicalJson();
    const original = structuredClone(loadTransitionManifest(manifestPath, expectedManifestSha256));
    const root = mkdtempSync(join(tmpdir(), 'zendio-transition-family-'));
    const freeze = (name: string, value: typeof original) => {
      const semantic = Object.fromEntries(
        Object.entries(structuredClone(value)).filter(([key]) => key !== 'internalDigest')
      );
      value.internalDigest = sha256(canonicalJsonBytes(semantic));
      const bytes = canonicalJsonBytes(value);
      const path = join(root, `${name}.json`);
      writeFileSync(path, bytes);
      return { path, bytes };
    };
    try {
      const nestedUnknown = structuredClone(original);
      nestedUnknown.closureNodes[0].unknown = true;
      const unknown = freeze('nested-unknown', nestedUnknown);
      expect(() => loadTransitionManifest(unknown.path, sha256(unknown.bytes))).toThrow(
        'TRANSITION_SCHEMA_MISMATCH:closureNodes[]'
      );

      const edgeValue = structuredClone(original);
      const node = edgeValue.closureNodes.find(
        (entry: (typeof original.closureNodes)[number]) => entry.adjacency.dependencies.length > 0
      );
      if (!node) throw new Error('fixture requires a dependency edge');
      node.adjacency.dependencies[0].resolvedKey = '';
      const badEdge = freeze('bad-edge', edgeValue);
      expect(() => loadTransitionManifest(badEdge.path, sha256(badEdge.bytes))).toThrow(
        'TRANSITION_SCHEMA_MISMATCH:closureNodes.adjacency.dependencies.value'
      );

      const duplicateRelation = structuredClone(original);
      duplicateRelation.lockDelta.addedKeys.push(duplicateRelation.lockDelta.addedKeys[0]);
      const duplicate = freeze('duplicate-relation', duplicateRelation);
      expect(() => loadTransitionManifest(duplicate.path, sha256(duplicate.bytes))).toThrow(
        'TRANSITION_RELATION_MISMATCH:lockDelta.addedKeys'
      );

      const countDrift = structuredClone(original);
      countDrift.counts.addedKeys += 1;
      const count = freeze('count-drift', countDrift);
      expect(() => loadTransitionManifest(count.path, sha256(count.bytes))).toThrow(
        'TRANSITION_RELATION_MISMATCH:counts'
      );

      const depthDrift = structuredClone(original);
      let nested = {};
      for (let index = 0; index < 10; index += 1) nested = { nested };
      depthDrift.extra = nested;
      const depth = freeze('depth', depthDrift);
      expect(() => loadTransitionManifest(depth.path, sha256(depth.bytes))).toThrow(
        'depth exceeds'
      );

      const oversized = structuredClone(original);
      oversized.extra = 'x'.repeat(65536);
      const large = freeze('oversized', oversized);
      expect(() => loadTransitionManifest(large.path, sha256(large.bytes))).toThrow(
        'exceeds limit'
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
