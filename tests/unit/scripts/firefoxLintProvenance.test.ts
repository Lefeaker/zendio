import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  assertFirefoxLintProvenance,
  FIREFOX_LINT_PROVENANCE_FILE,
  writeFirefoxLintProvenance
} from '../../../scripts/utils/firefoxLintProvenance.mjs';

const roots: string[] = [];
const BASE64_VLQ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function encodeVlq(value: number) {
  let encoded = value < 0 ? (-value << 1) | 1 : value << 1;
  let result = '';
  do {
    let digit = encoded & 31;
    encoded >>>= 5;
    if (encoded > 0) {
      digit |= 32;
    }
    result += BASE64_VLQ[digit];
  } while (encoded > 0);
  return result;
}

function encodeSegment(values: number[]) {
  return values.map(encodeVlq).join('');
}

function createGitIdentity() {
  return vi.fn((_file: string, args: string[]) =>
    Promise.resolve({ stdout: args.at(-1) === 'HEAD' ? 'commit-fixture\n' : 'tree-fixture\n' })
  );
}

async function createFixture() {
  const root = await mkdtemp(join(tmpdir(), 'aiiinob-firefox-lint-provenance-'));
  roots.push(root);
  const distDir = join(root, 'build', 'dist-firefox');
  const chunksDir = join(distDir, 'chunks');
  const readabilityPath = join(root, 'node_modules', '@mozilla', 'readability', 'Readability.js');
  await mkdir(chunksDir, { recursive: true });
  await mkdir(join(root, 'node_modules', '@mozilla', 'readability'), { recursive: true });
  await writeFile(join(root, 'package.json'), '{"name":"fixture"}\n');
  await writeFile(join(root, 'package-lock.json'), '{"lockfileVersion":3}\n');
  await writeFile(readabilityPath, `${'\n'.repeat(1927)}const readability = true;\n`);
  await writeFile(join(chunksDir, 'chunk-readability.js'), 'const bundle = true;\n');
  const mappings = [
    '',
    [encodeSegment([0, 0, 1548, 0]), encodeSegment([10, 0, 379, 0])].join(',')
  ].join(';');
  await writeFile(
    join(chunksDir, 'chunk-readability.js.map'),
    JSON.stringify({
      version: 3,
      file: 'chunk-readability.js',
      sources: ['../../../node_modules/@mozilla/readability/Readability.js'],
      names: [],
      mappings
    })
  );
  const execFileImpl = createGitIdentity();
  await writeFirefoxLintProvenance(
    { buildConfig: { browser: 'firefox', sourcemap: 'external' }, distDir, repoRoot: root },
    { execFileImpl }
  );
  return { distDir, execFileImpl, root };
}

describe('Firefox lint provenance', () => {
  afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
  });

  it('binds byte-exact chunks and maps both allowed warning spans to Readability source lines', async () => {
    const { distDir, execFileImpl, root } = await createFixture();
    const result = await assertFirefoxLintProvenance(
      {
        distDir,
        repoRoot: root,
        warnings: [
          {
            code: 'UNSAFE_VAR_ASSIGNMENT',
            message: 'Unsafe assignment to innerHTML',
            file: 'chunks/chunk-readability.js',
            line: 2,
            column: 1
          },
          {
            code: 'UNSAFE_VAR_ASSIGNMENT',
            message: 'Unsafe assignment to innerHTML',
            file: 'chunks/chunk-readability.js',
            line: 2,
            column: 11
          }
        ]
      },
      { execFileImpl }
    );

    expect(result.provenancePath).toBe(join(root, 'build', FIREFOX_LINT_PROVENANCE_FILE));
    expect(result.mappedWarnings.map((warning) => warning.line)).toEqual([1549, 1928]);
    expect(
      result.mappedWarnings.every((warning) => warning.source.includes('@mozilla/readability'))
    ).toBe(true);
    expect(sha256(await readFile(result.provenancePath, 'utf8'))).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a warning message that drifts before provenance can be accepted', async () => {
    const { distDir, execFileImpl, root } = await createFixture();

    await expect(
      assertFirefoxLintProvenance(
        {
          distDir,
          repoRoot: root,
          warnings: [
            {
              code: 'UNSAFE_VAR_ASSIGNMENT',
              message: 'Unsafe assignment to outerHTML',
              file: 'chunks/chunk-readability.js',
              line: 2,
              column: 1
            },
            {
              code: 'UNSAFE_VAR_ASSIGNMENT',
              message: 'Unsafe assignment to innerHTML',
              file: 'chunks/chunk-readability.js',
              line: 2,
              column: 11
            }
          ]
        },
        { execFileImpl }
      )
    ).rejects.toThrow('FIREFOX_LINT_THIRD_PARTY_WARNING_PROVENANCE_DRIFT');
  });

  it('rejects a changed generated chunk after provenance publication', async () => {
    const { distDir, execFileImpl, root } = await createFixture();
    await writeFile(join(distDir, 'chunks', 'chunk-readability.js'), 'const changed = true;\n');

    await expect(
      assertFirefoxLintProvenance(
        {
          distDir,
          repoRoot: root,
          warnings: [
            {
              code: 'UNSAFE_VAR_ASSIGNMENT',
              message: 'Unsafe assignment to innerHTML',
              file: 'chunks/chunk-readability.js',
              line: 2,
              column: 1
            },
            {
              code: 'UNSAFE_VAR_ASSIGNMENT',
              message: 'Unsafe assignment to innerHTML',
              file: 'chunks/chunk-readability.js',
              line: 2,
              column: 11
            }
          ]
        },
        { execFileImpl }
      )
    ).rejects.toThrow('FIREFOX_LINT_PROVENANCE_ARTIFACT_DRIFT');
  });
});
