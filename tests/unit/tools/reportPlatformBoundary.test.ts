import { describe, expect, it } from 'vitest';

type PlatformBoundaryModule = {
  collectPlatformBoundaryFindingsFromSource: (
    file: string,
    source: string
  ) => Array<{
    file: string;
    line: number;
    token: string;
    classification: string;
    requiredAction: string;
  }>;
  formatPlatformBoundaryReport: (
    rows: Array<{
      file: string;
      line: number;
      token: string;
      classification: string;
      requiredAction: string;
    }>
  ) => string;
  evaluatePlatformBoundaryCheck: (rows: Array<{ classification: string }>) => {
    ok: boolean;
    violations: Array<{ classification: string }>;
  };
};

const {
  collectPlatformBoundaryFindingsFromSource,
  evaluatePlatformBoundaryCheck,
  formatPlatformBoundaryReport
} = (await import(
  new URL('../../../tools/report-platform-boundary.mjs', import.meta.url).href
)) as PlatformBoundaryModule;

describe('report-platform-boundary', () => {
  it('ignores chrome, browser, and globalThis.chrome mentions in comments and strings', () => {
    const rows = collectPlatformBoundaryFindingsFromSource(
      'src/background/services/example.ts',
      [
        '// chrome.runtime.sendMessage and browser.runtime.sendMessage are examples',
        'const message = "globalThis.chrome.storage.local";',
        'const template = `chrome.notifications.TemplateType`;'
      ].join('\n')
    );

    expect(rows).toEqual([]);
  });

  it('classifies type-only shared references separately from runtime usages', () => {
    const rows = collectPlatformBoundaryFindingsFromSource(
      'src/shared/notifications/types.ts',
      [
        'export type NotificationId = chrome.notifications.NotificationId;',
        'export interface BrowserTab { tab?: browser.tabs.Tab }'
      ].join('\n')
    );

    expect(rows).toEqual([
      expect.objectContaining({
        line: 1,
        token: 'chrome.notifications',
        classification: 'type-only'
      }),
      expect.objectContaining({
        line: 2,
        token: 'browser.tabs',
        classification: 'type-only'
      })
    ]);
    expect(rows[0]?.requiredAction).toContain('Keep type-only');
    expect(rows[1]?.requiredAction).toContain('Keep type-only');
  });

  it('classifies shared runtime helpers with explicit review action', () => {
    const rows = collectPlatformBoundaryFindingsFromSource(
      'src/shared/types/result.ts',
      'export const lastError = chrome.runtime.lastError;'
    );

    expect(rows).toEqual([
      expect.objectContaining({
        token: 'chrome.runtime',
        classification: 'shared-runtime-helper'
      })
    ]);
    expect(rows[0]?.requiredAction).toContain('Review');
  });

  it('classifies globalThis chrome probes without treating object keys as bare globals', () => {
    const rows = collectPlatformBoundaryFindingsFromSource(
      'src/content/shared/panels/sessionPanelResize.ts',
      [
        'const root = globalThis.chrome;',
        'const value = root?.storage;',
        'Object.assign(globalThis, { chrome: {} });'
      ].join('\n')
    );

    expect(rows).toEqual([
      expect.objectContaining({
        line: 1,
        token: 'globalThis.chrome',
        classification: 'migration-needed'
      }),
      expect.objectContaining({
        line: 3,
        token: 'globalThis.chrome',
        classification: 'migration-needed'
      })
    ]);
  });

  it('classifies adapter, offscreen permission root, and migration-needed runtime usages', () => {
    expect(
      collectPlatformBoundaryFindingsFromSource(
        'src/platform/chrome/runtime.ts',
        'chrome.runtime.getManifest();'
      )[0]
    ).toEqual(expect.objectContaining({ classification: 'platform-adapter' }));

    expect(
      collectPlatformBoundaryFindingsFromSource(
        'src/offscreen/localVault.ts',
        'chrome.runtime.onMessage.addListener(() => undefined);'
      )[0]
    ).toEqual(expect.objectContaining({ classification: 'offscreen-local-vault-permission-root' }));

    expect(
      collectPlatformBoundaryFindingsFromSource(
        'src/background/services/analyticsEvents.ts',
        'chrome.runtime.getManifest();'
      )[0]
    ).toEqual(expect.objectContaining({ classification: 'migration-needed' }));
  });

  it('formats file, line, token, classification, and required action, while report check passes', () => {
    const rows = collectPlatformBoundaryFindingsFromSource(
      'src/background/services/analyticsEvents.ts',
      'chrome.runtime.getManifest();'
    );
    const report = formatPlatformBoundaryReport(rows);

    expect(report).toContain(
      'src/background/services/analyticsEvents.ts:1 token=chrome.runtime classification=migration-needed requiredAction='
    );
    expect(evaluatePlatformBoundaryCheck(rows)).toEqual({ ok: true, violations: [] });
  });
});
