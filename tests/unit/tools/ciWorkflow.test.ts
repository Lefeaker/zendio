import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

function readCiWorkflow(): string {
  return readFileSync(resolve('.github/workflows/ci.yml'), 'utf8');
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

    expect(workflow).toContain('static-gates:');
    expect(workflow).toContain('coverage:');
    expect(workflow).toContain('visual:');
    expect(workflow).toContain('e2e:');
    expect(workflow).toContain('package:');
    expect(workflow).toContain('needs: [static-gates, coverage, visual, e2e]');
  });

  it('uses fast production builds after static gates have already run', () => {
    const workflow = readCiWorkflow();

    expect(workflow).not.toMatch(/run:\s*npm run build\s*(?:\n|$)/);
    expect(workflow).toContain('run: npm run build:fast');
    expect(workflow).toContain('npm run package:ci');
  });
});
