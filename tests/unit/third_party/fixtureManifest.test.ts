import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
  ACTIVE_AI_CHAT_FIXTURES,
  AI_CHAT_FIXTURE_MANIFEST,
  PENDING_AI_CHAT_FIXTURES
} from '../../fixtures/ai-chat/fixtureManifest';

const fixtureRoot = join(process.cwd(), 'tests/fixtures/ai-chat');
const legacyDate = 'legacy-unknown';
const knownRealUserNamesFromP00: readonly string[] = [];

function fixturePath(file: string): string {
  return join(fixtureRoot, file);
}

function fixtureExists(file: string): boolean {
  return existsSync(fixturePath(file));
}

function listCommittedFixtureFiles(): readonly string[] {
  const rootFiles = readdirSync(fixtureRoot)
    .filter((file) => file.endsWith('.html'))
    .sort();

  const currentDomRoot = join(fixtureRoot, 'current-dom');
  const currentDomFiles = existsSync(currentDomRoot)
    ? readdirSync(currentDomRoot)
        .filter((file) => file.endsWith('.html'))
        .map((file) => `current-dom/${file}`)
        .sort()
    : [];

  return [...rootFiles, ...currentDomFiles].sort();
}

function collectPrivacyFindings(file: string): readonly string[] {
  const html = readFileSync(fixturePath(file), 'utf8');
  const findings: string[] = [];
  const checks: readonly [string, RegExp][] = [
    ['email', /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu],
    ['bearer token', /\bbearer\s+[A-Za-z0-9._~+/=-]{16,}/giu],
    ['api key token', /\b(?:api[_-]?key|secret|token)\s*[:=]\s*["']?[A-Za-z0-9._~+/=-]{16,}/giu],
    ['external URL', /\bhttps?:\/\/[^\s"'<>]+/giu]
  ];

  for (const [label, pattern] of checks) {
    if (pattern.test(html)) {
      findings.push(label);
    }
  }

  for (const name of knownRealUserNamesFromP00) {
    if (html.includes(name)) {
      findings.push(`P00 real user name: ${name}`);
    }
  }

  return findings;
}

describe('AI chat fixture manifest', () => {
  it('covers every committed fixture file exactly once with metadata', () => {
    const committedFiles = listCommittedFixtureFiles();
    const manifestFiles = AI_CHAT_FIXTURE_MANIFEST.map((fixture) => fixture.file).sort();
    const committedManifestFiles = AI_CHAT_FIXTURE_MANIFEST.filter((fixture) =>
      committedFiles.includes(fixture.file)
    )
      .map((fixture) => fixture.file)
      .sort();

    expect(committedManifestFiles).toEqual(committedFiles);
    expect(new Set(manifestFiles).size).toBe(AI_CHAT_FIXTURE_MANIFEST.length);
  });

  it('requires active files to exist and limits committed pending files to residual repair notes', () => {
    const committedFiles = new Set(listCommittedFixtureFiles());

    for (const fixture of ACTIVE_AI_CHAT_FIXTURES) {
      expect(fixtureExists(fixture.file), fixture.file).toBe(true);
    }

    for (const fixture of PENDING_AI_CHAT_FIXTURES) {
      expect(ACTIVE_AI_CHAT_FIXTURES.some((active) => active.file === fixture.file)).toBe(false);

      if (!committedFiles.has(fixture.file)) {
        continue;
      }

      expect(fixture.file, fixture.file).toMatch(
        /^current-dom\/.+-live-residual-2026-06-25\.html$/u
      );
      expect(fixture.ownerMilestone, fixture.file).toMatch(/^P10\/P1[23]$/u);
      expect(fixture.captureKind, fixture.file).toBe('current-dom-sanitized');
      expect(fixture.privacyStatus, fixture.file).toBe('sanitized');
    }
  });

  it('requires committed current-DOM fixtures to use concrete sanitized capture metadata', () => {
    const committedCurrentDomFiles = listCommittedFixtureFiles().filter((file) =>
      file.startsWith('current-dom/')
    );
    const currentDomFiles = AI_CHAT_FIXTURE_MANIFEST.filter(
      (fixture) => fixture.file.startsWith('current-dom/') && fixtureExists(fixture.file)
    )
      .map((fixture) => fixture.file)
      .sort();

    expect(currentDomFiles).toEqual(committedCurrentDomFiles);

    for (const fixture of AI_CHAT_FIXTURE_MANIFEST.filter(
      (entry) => entry.file.startsWith('current-dom/') && fixtureExists(entry.file)
    )) {
      expect(fixture.sourceCaptureDate).not.toBe(legacyDate);
      expect(fixture.sourceCaptureDate).toMatch(/^\d{4}-\d{2}-\d{2}$/u);
      expect(fixture.privacyStatus).toBe('sanitized');
    }
  });

  it('keeps committed fixture HTML privacy-stripped', () => {
    const findings = AI_CHAT_FIXTURE_MANIFEST.filter((fixture) =>
      fixtureExists(fixture.file)
    ).flatMap((fixture) =>
      collectPrivacyFindings(fixture.file).map((finding) => `${fixture.file}: ${finding}`)
    );

    expect(findings).toEqual([]);
  });
});
