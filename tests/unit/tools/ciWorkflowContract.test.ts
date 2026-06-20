import { execFileSync } from 'node:child_process';

describe('CI workflow contract', () => {
  it('accepts the repository workflow topology', () => {
    expect(() => {
      execFileSync('node', ['tools/report-ci-workflow-contract.mjs', '--check'], {
        encoding: 'utf8',
        stdio: 'pipe'
      });
    }).not.toThrow();
  });
});
