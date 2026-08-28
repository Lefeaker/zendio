export const GITHUB_ACTION_PIN_VERSION = 'github-action-pins-v1';
export const GITHUB_ACTION_PIN_RESOLUTION_DATE = '2026-08-28';

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

export const GITHUB_ACTION_PINS = deepFreeze([
  {
    action: 'actions/checkout',
    alias: 'v6',
    commit: 'd23441a48e516b6c34aea4fa41551a30e30af803',
    actionManifestSha256: 'd59219cb79590abdb877deaa14e3b65a00c05318bf5a6f3b989b9162b5d08c35',
    runtime: {
      using: 'node24',
      main: 'dist/index.js',
      post: 'dist/index.js'
    },
    capabilities: {
      persistCredentialsDefault: true
    }
  },
  {
    action: 'actions/setup-node',
    alias: 'v6',
    commit: '249970729cb0ef3589644e2896645e5dc5ba9c38',
    actionManifestSha256: 'ad45f1922115116fb4706651d0a9262332bc4e4f11eb2021e09789dd1af18085',
    runtime: {
      using: 'node24',
      main: 'dist/setup/index.js',
      post: 'dist/cache-save/index.js',
      postIf: 'success()'
    },
    capabilities: {}
  },
  {
    action: 'actions/upload-artifact',
    alias: 'v7',
    commit: '043fb46d1a93c77aae656e7c1c64a875d1fc6a0a',
    actionManifestSha256: 'c5979822866a72362e609844b6ebe77d4b7e759af68cc1c2c425dcf51481fab4',
    runtime: {
      using: 'node24',
      main: 'dist/upload/index.js'
    },
    capabilities: {
      overwriteDefault: false,
      outputs: ['artifact-id', 'artifact-digest']
    }
  },
  {
    action: 'actions/download-artifact',
    alias: 'v8',
    commit: '3e5f45b2cfb9172054b4087a40e8e0b5a5461e7c',
    actionManifestSha256: 'e98559b7a31ba31be4709f20d22102dc2737fa630f69a339eb89981151e505fe',
    runtime: {
      using: 'node24',
      main: 'dist/index.js'
    },
    capabilities: {
      artifactIdsInput: true,
      digestMismatchDefault: 'error'
    }
  },
  {
    action: 'actions/github-script',
    alias: 'v8',
    commit: 'ed597411d8f924073f98dfc5c65a23a2325f34cd',
    actionManifestSha256: '2155c7b84863afcfe81a73ab8eafcb2c2f304a995cbe282c31617aa847dff1d8',
    runtime: {
      using: 'node24',
      main: 'dist/index.js'
    },
    capabilities: {
      retriesDefault: 0
    }
  }
]);
