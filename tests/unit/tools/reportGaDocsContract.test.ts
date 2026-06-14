import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

const scriptPath = resolve('tools/report-ga-docs-contract.mjs');

interface ProxyEventContract {
  name: string;
  classification: 'emitted' | 'error' | 'dev-only' | 'contract-only' | 'future';
  runtimeAllowed: boolean;
}

interface FixtureOptions {
  activeRows?: string[];
  catalogRows?: string[];
  dashboardEvents?: string[];
  dashboardDimensions?: string[];
  configDoc?: string;
}

function createProxyContract(): { events: ProxyEventContract[] } {
  return {
    events: [
      { name: 'support_link_clicked', classification: 'emitted', runtimeAllowed: true },
      { name: 'support_like_clicked', classification: 'emitted', runtimeAllowed: true },
      { name: 'runtime_harness_open', classification: 'dev-only', runtimeAllowed: true },
      { name: 'extension_error', classification: 'error', runtimeAllowed: false },
      { name: 'video_started', classification: 'contract-only', runtimeAllowed: true },
      { name: 'video_screenshot_captured', classification: 'future', runtimeAllowed: true }
    ]
  };
}

function createFixture({
  activeRows = [
    row('support_link_clicked', 'emitted', true),
    row('support_like_clicked', 'emitted', true),
    row('runtime_harness_open', 'dev-only', true),
    row('extension_error', 'error', false)
  ],
  catalogRows = [
    row('video_started', 'contract-only', true),
    row('video_screenshot_captured', 'future', true, 'current branch has no active emitter')
  ],
  dashboardEvents = ['support_link_clicked', 'support_like_clicked', 'extension_error'],
  dashboardDimensions = ['duration_bucket'],
  configDoc = defaultConfigDoc()
}: FixtureOptions = {}): string {
  const dir = mkdtempSync(join(tmpdir(), 'aiiinob-ga-docs-contract-'));
  const docsDir = join(dir, 'docs');
  const reportsDir = join(dir, 'build', 'reports');

  mkdirSync(docsDir, { recursive: true });
  mkdirSync(reportsDir, { recursive: true });

  writeFile(
    join(reportsDir, 'ga-proxy-contract.json'),
    JSON.stringify(createProxyContract(), null, 2)
  );
  writeFile(join(docsDir, 'ga4-telemetry-reference.md'), referenceDoc(activeRows, catalogRows));
  writeFile(join(docsDir, 'analytics-configuration-guide.md'), configDoc);
  writeFile(
    join(docsDir, 'google-analytics-dashboard-setup.md'),
    dashboardDoc(dashboardEvents, dashboardDimensions)
  );

  return dir;
}

function writeFile(path: string, contents: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${contents.trim()}\n`, 'utf8');
}

function row(
  eventName: string,
  classification: string,
  runtimeAllowed: boolean,
  currentTruth = 'ok'
): string {
  return `| \`${eventName}\` | none | \`${classification}\` | \`${String(runtimeAllowed)}\` | ${currentTruth} |`;
}

function referenceDoc(activeRows: string[], catalogRows: string[]): string {
  return `
# GA4 Telemetry Reference

<!-- GA_SCHEMA_TABLE_START:support_usage_error -->
| Event | Params | Class | Runtime | Notes |
| --- | --- | --- | --- | --- |
${activeRows.join('\n')}
<!-- GA_SCHEMA_TABLE_END:support_usage_error -->

<!-- GA_SCHEMA_TABLE_START:catalog_only -->
| Event | Params | Class | Runtime | Notes |
| --- | --- | --- | --- | --- |
${catalogRows.join('\n')}
<!-- GA_SCHEMA_TABLE_END:catalog_only -->
`;
}

function defaultConfigDoc(): string {
  return `
# Analytics Configuration Guide

GA \`api_secret\` remains server-only in the Cloudflare Worker secret \`GA4_API_SECRET\`.
Do not put it in extension source, tracked config, or \`.env.production.local\`.
`;
}

function dashboardDoc(events: string[], dimensions: string[]): string {
  return `
# Google Analytics Dashboard Setup

## Recommended event-scoped dimensions

${dimensions.map((dimension) => `| \`${dimension}\` | example |`).join('\n')}

## Recommended Explorations

### Core events

${events.map((eventName) => `- \`${eventName}\``).join('\n')}
`;
}

function runReport(root: string) {
  return spawnSync(
    process.execPath,
    [
      scriptPath,
      '--check',
      '--proxy-contract',
      join(root, 'build', 'reports', 'ga-proxy-contract.json'),
      '--reference-doc',
      join(root, 'docs', 'ga4-telemetry-reference.md'),
      '--config-doc',
      join(root, 'docs', 'analytics-configuration-guide.md'),
      '--dashboard-doc',
      join(root, 'docs', 'google-analytics-dashboard-setup.md')
    ],
    {
      encoding: 'utf8'
    }
  );
}

describe('report-ga-docs-contract', () => {
  it('passes when docs, dashboard, and server-only proxy guidance match the proxy contract', () => {
    const fixtureRoot = createFixture();

    try {
      const result = runReport(fixtureRoot);

      expect(result.status).toBe(0);
      expect(result.stdout + result.stderr).toContain('Check passed');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('fails when the active reference table contains an extra docs event', () => {
    const fixtureRoot = createFixture({
      activeRows: [
        row('support_link_clicked', 'emitted', true),
        row('support_like_clicked', 'emitted', true),
        row('runtime_harness_open', 'dev-only', true),
        row('extension_error', 'error', false),
        row('extension_usage', 'inventory-only', false)
      ]
    });

    try {
      const result = runReport(fixtureRoot);

      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('extra active docs rows');
      expect(result.stdout + result.stderr).toContain('extension_usage');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('fails when an emitted event is missing from the active reference table', () => {
    const fixtureRoot = createFixture({
      activeRows: [
        row('support_link_clicked', 'emitted', true),
        row('runtime_harness_open', 'dev-only', true),
        row('extension_error', 'error', false)
      ]
    });

    try {
      const result = runReport(fixtureRoot);

      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('missing active docs rows');
      expect(result.stdout + result.stderr).toContain('support_like_clicked');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('fails when a documented event classification drifts from the proxy contract', () => {
    const fixtureRoot = createFixture({
      activeRows: [
        row('support_link_clicked', 'emitted', true),
        row('support_like_clicked', 'emitted', true),
        row('runtime_harness_open', 'dev-only', true),
        row('extension_error', 'emitted', false)
      ]
    });

    try {
      const result = runReport(fixtureRoot);

      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('classification mismatch');
      expect(result.stdout + result.stderr).toContain('extension_error');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('fails when the dashboard recommends a non-active contract event', () => {
    const fixtureRoot = createFixture({
      dashboardEvents: ['support_link_clicked', 'extension_error', 'video_screenshot_captured']
    });

    try {
      const result = runReport(fixtureRoot);

      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('dashboard recommends non-active events');
      expect(result.stdout + result.stderr).toContain('video_screenshot_captured');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('fails when the dashboard documents raw duration fields as dimensions', () => {
    const fixtureRoot = createFixture({
      dashboardDimensions: ['duration_bucket', 'duration_ms']
    });

    try {
      const result = runReport(fixtureRoot);

      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('dashboard uses forbidden raw dimensions');
      expect(result.stdout + result.stderr).toContain('duration_ms');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });

  it('fails when docs instruct owners to set GA4_API_SECRET in extension-side public config', () => {
    const fixtureRoot = createFixture({
      configDoc: `
# Analytics Configuration Guide

Put this in \`.env.production.local\`:

\`\`\`bash
GA4_API_SECRET=do-not-do-this
\`\`\`
`
    });

    try {
      const result = runReport(fixtureRoot);

      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toContain(
        'forbidden extension-side secret instruction'
      );
      expect(result.stdout + result.stderr).toContain('GA4_API_SECRET');
    } finally {
      rmSync(fixtureRoot, { recursive: true, force: true });
    }
  });
});
