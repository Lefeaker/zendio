import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readCiWorkflow(): string {
  return readFileSync(resolve('.github/workflows/ci.yml'), 'utf8');
}

function readWorkflowSupportFile(path: string): string {
  return readFileSync(resolve(path), 'utf8');
}

describe('CI workflow wiring', () => {
  it('cancels superseded runs for the same workflow ref or PR', () => {
    const workflow = readCiWorkflow();

    expect(workflow).toContain('concurrency:');
    expect(workflow).toContain(
      'group: ${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}'
    );
    expect(workflow).toContain('cancel-in-progress: true');
  });

  it('splits independent checks into parallel jobs before packaging', () => {
    const workflow = readCiWorkflow();

    expect(workflow).toContain('static-preflight:');
    expect(workflow).toContain('static-release-surface:');
    expect(workflow).toContain('static-generated-artifacts:');
    expect(workflow).toContain('static-style-and-locale:');
    expect(workflow).toContain('static-reporting-audits:');
    expect(workflow).toContain('coverage:');
    expect(workflow).toContain('visual:');
    expect(workflow).toContain('e2e-vitest:');
    expect(workflow).toContain('browser-yaml:');
    expect(workflow).toContain('browser-reader-panel:');
    expect(workflow).toContain('browser-smoke:');
    expect(workflow).toContain('package:');
    expect(workflow).toContain('needs: [static-preflight]');
    expect(workflow).not.toContain('static-gates:');
    expect(workflow).not.toContain('  e2e:\n');
  });

  it('uses fast production builds after static gates have already run', () => {
    const workflow = readCiWorkflow();

    expect(workflow).not.toMatch(/run:\s*npm run build\s*(?:\n|$)/);
    expect(workflow).toContain('run: npm run build:fast');
    expect(workflow).toContain('npm run package:ci');
  });

  it('uses Node 24-compatible official actions', () => {
    const workflow = readCiWorkflow();
    const setupNodeAction = readWorkflowSupportFile('.github/actions/setup-node-deps/action.yml');

    expect(workflow).toContain('uses: actions/checkout@v6');
    expect(setupNodeAction).toContain('uses: actions/setup-node@v6');
    expect(workflow).toContain('uses: actions/upload-artifact@v7');
    expect(workflow).toContain('uses: actions/github-script@v8');
    expect(workflow).not.toMatch(/actions\/checkout@v[1-5]\b/);
    expect(setupNodeAction).not.toMatch(/actions\/setup-node@v[1-5]\b/);
    expect(workflow).not.toMatch(/actions\/upload-artifact@v[1-6]\b/);
    expect(workflow).not.toMatch(/actions\/github-script@v[1-7]\b/);
  });
});
