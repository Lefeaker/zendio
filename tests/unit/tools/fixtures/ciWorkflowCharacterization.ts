export const CI_CONTRACT_PUBLIC_EXPORTS = ['checkCiWorkflowContract', 'parseCiWorkflowJobs'];

export const CI_WORKFLOW_CHARACTERIZATION = {
  parsedSemanticSha256: '662f88afd8f430176d17dd07f6bb678c34aeddab07d514810234cda27dafe223',
  validResult: { ok: true, failures: [] },
  timeoutMutation: {
    from: [
      '  browser-video:',
      '    name: Browser video flow',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 20'
    ].join('\n'),
    to: [
      '  browser-video:',
      '    name: Browser video flow',
      '    runs-on: ubuntu-latest',
      '    timeout-minutes: 19'
    ].join('\n'),
    failures: [
      'browser-video-parsed-contract: job "browser-video" timeout must be an integer of at least 20 minutes'
    ]
  },
  checkCli: {
    status: 0,
    signal: null,
    stdout: '',
    stderr: ''
  }
};
