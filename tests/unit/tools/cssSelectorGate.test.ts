import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import fixtures from '../../fixtures/css-selector-gate.json';
import { runBoundedCommand } from '../../../scripts/utils/boundedCommand.mjs';
import { resolveCommandProfile } from '../../../scripts/config/commandBoundaryProfiles.mjs';
import { CSS_PATTERNS, lintCssFiles, lintCssSource } from '../../../tools/check-css-selectors.mjs';

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe('CSS selector gate', () => {
  it.each(fixtures)('preserves the former rule for $name', ({ css, errors }) => {
    expect(lintCssSource(css, 'src/ui/fixture.css')).toHaveLength(errors);
  });

  it('reports a useful source position and rejects malformed selectors and CSS', () => {
    expect(lintCssSource('\n.aob-bad {}', 'src/ui/fixture.css')[0]).toMatchObject({
      file: 'src/ui/fixture.css',
      line: 2,
      column: 1,
      rule: 'selector-class-pattern'
    });
    expect(lintCssSource('.good/ {}', 'src/ui/fixture.css')[0]?.rule).toBe('selector-parse-error');
    expect(lintCssSource('.good {', 'src/ui/fixture.css')[0]?.rule).toBe('css-syntax-error');
  });

  it('enumerates all three roots, deduplicates paths and retains the retired Tailwind exclusion', () => {
    const root = mkdtempSync(join(tmpdir(), 'zendio-css-selector-'));
    roots.push(root);
    for (const directory of ['options', 'onboarding', 'ui']) {
      const dir = join(root, 'src', directory, 'styles');
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, 'panel.css'), '.aob-bad {}');
    }
    writeFileSync(join(root, 'src/options/styles/tailwind.css'), '.aob-ignored {}');
    const result = lintCssFiles([...CSS_PATTERNS, 'src/ui/styles/panel.css'], root);
    expect(result.files).toHaveLength(3);
    expect(result.issues).toHaveLength(3);
    expect(() => lintCssFiles(['src/ui/missing.css'], root)).toThrow('No CSS files matched');
    writeFileSync(join(root, 'outside.css'), '.good {}');
    expect(() => lintCssFiles(['outside.css'], root)).toThrow('outside the governed roots');
  });

  it('uses the fixed owned script and retains the existing quick command budget', () => {
    const spec = resolveCommandProfile('css-selector-v1', CSS_PATTERNS, { environment: {} });
    expect(spec.argv[0]).toBe(join(process.cwd(), 'tools/check-css-selectors.mjs'));
    expect(spec.limits.activeMs).toBe(60_000);
    expect(spec.shell).toBe(false);
    expect(() =>
      resolveCommandProfile('css-selector-v1', ['--fix'], { environment: {} })
    ).toThrow();
  });

  it('runs the real complete CSS gate through the command boundary', async () => {
    const result = await runBoundedCommand({
      profileId: 'css-selector-v1',
      arguments: CSS_PATTERNS
    });
    expect(result.ok, result.output.stderr.text).toBe(true);
    expect(result.output.stdout.text).toMatch(/Checked \d+ CSS files; 0 issues/);
    for (const file of lintCssFiles().files) {
      expect(lintCssSource(readFileSync(file, 'utf8'), file)).toEqual([]);
    }
  });

  it('fails the actual CLI when a selection is missing instead of silently skipping checks', async () => {
    const result = await runBoundedCommand({
      profileId: 'css-selector-v1',
      arguments: ['src/ui/does-not-exist.css']
    });
    expect(result.ok).toBe(false);
    expect(result.output.stderr.text).toContain('No CSS files matched');
  });
});
