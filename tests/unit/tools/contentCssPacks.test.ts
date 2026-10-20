import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { lintCssFiles, lintCssSource } from '../../../tools/check-css-selectors.mjs';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CONTENT_CSS_PACKS,
  validateContentCssPacks
} from '../../../tools/report-content-css-packs.mjs';

const roots: string[] = [];

function createPackFixture(): string {
  const root = mkdtempSync(join(tmpdir(), 'zendio-content-css-'));
  roots.push(root);
  const output = join(root, 'ui/stitch-runtime/styles');
  mkdirSync(output, { recursive: true });
  for (const id of Object.keys(CONTENT_CSS_PACKS)) {
    writeFileSync(join(output, `${id}.css`), `.${id.replace('-', '_')}{display:block}`);
  }
  return root;
}

afterEach(() => {
  roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true }));
});

describe('content CSS packs', () => {
  it('requires the exact six flattened deterministic output names', () => {
    const distDir = createPackFixture();
    const report = validateContentCssPacks({ root: process.cwd(), distDir });
    expect(report.failures).toEqual([]);
    expect(report.packs.map(({ id }) => id)).toEqual(Object.keys(CONTENT_CSS_PACKS));
    expect(report.packs.every(({ sha256 }) => /^[a-f0-9]{64}$/.test(sha256))).toBe(true);
  });

  it('rejects imports, extra packs and content-pack budget overflow', () => {
    const distDir = createPackFixture();
    const output = join(distDir, 'ui/stitch-runtime/styles');
    writeFileSync(join(output, 'reader.css'), '@import "extra.css";');
    writeFileSync(join(output, 'aggregate.css'), '.aggregate{}');
    writeFileSync(join(output, 'video.css'), 'x'.repeat(78_545));
    const report = validateContentCssPacks({ root: process.cwd(), distDir });
    expect(report.failures).toEqual(
      expect.arrayContaining([
        expect.stringContaining('reader.css'),
        expect.stringContaining('video.css'),
        expect.stringContaining('unexpected CSS pack set')
      ])
    );
  });

  it('applies the same real selector rule to retained Options and neutral UI CSS', () => {
    const actual = lintCssFiles();
    expect(actual.issues).toEqual([]);
    for (const directory of ['options', 'onboarding', 'ui']) {
      expect(actual.files.some((file) => file.startsWith(`src/${directory}/`))).toBe(true);
      const invalid = lintCssSource(
        '.aob-forbidden { color: red; }',
        `src/${directory}/invalid.css`
      );
      expect(invalid).toHaveLength(1);
      expect(invalid[0]?.rule).toBe('selector-class-pattern');
    }
  });
});
