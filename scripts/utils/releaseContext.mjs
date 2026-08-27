export const RELEASE_CONTEXT_SCHEMA = 'zendio-release-context-v1';
export const RELEASE_CONTEXT_EVENTS = Object.freeze(['push-tag', 'workflow-dispatch']);
export const FIREFOX_RELEASE_CHANNELS = Object.freeze(['listed', 'unlisted']);

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function exactSha(value, code = 'RELEASE_CONTEXT_SHA_INVALID') {
  if (typeof value !== 'string' || !/^[0-9a-fA-F]{40}$/u.test(value)) fail(code);
  return value.toLowerCase();
}

function exactVersion(value) {
  if (typeof value !== 'string' || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value)) {
    fail('RELEASE_CONTEXT_VERSION_INVALID');
  }
  return value;
}

export function canonicalizeExpectedReleaseSha(value) {
  return exactSha(value, 'RELEASE_CONTEXT_EXPECTED_SHA_INVALID');
}

export function resolveReleaseContext(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    fail('RELEASE_CONTEXT_INPUT_INVALID');
  }
  const {
    eventName,
    ref,
    eventSha,
    headSha,
    mainSha,
    packageVersion,
    expectedSha,
    browser,
    channel
  } = options;
  if (!['chrome', 'firefox'].includes(browser)) fail('RELEASE_CONTEXT_BROWSER_INVALID');
  const version = exactVersion(packageVersion);
  const canonicalHead = exactSha(headSha);
  const canonicalEvent = exactSha(eventSha);
  const canonicalMain = exactSha(mainSha);
  let releaseSha;
  let releaseEvent;
  let releaseChannel = null;
  if (eventName === 'push') {
    if (ref !== `refs/tags/v${version}`) fail('RELEASE_CONTEXT_TAG_INVALID');
    releaseSha = canonicalHead;
    releaseEvent = 'push-tag';
    if (expectedSha !== undefined && expectedSha !== null && expectedSha !== '') {
      fail('RELEASE_CONTEXT_EXPECTED_SHA_FORBIDDEN');
    }
    if (browser === 'firefox') releaseChannel = 'listed';
  } else if (eventName === 'workflow_dispatch') {
    if (ref !== 'refs/heads/main') fail('RELEASE_CONTEXT_DISPATCH_REF_INVALID');
    releaseSha = canonicalizeExpectedReleaseSha(expectedSha);
    releaseEvent = 'workflow-dispatch';
    if (browser === 'firefox') {
      if (!FIREFOX_RELEASE_CHANNELS.includes(channel)) fail('RELEASE_CONTEXT_CHANNEL_INVALID');
      releaseChannel = channel;
    } else if (channel !== undefined && channel !== null && channel !== '') {
      fail('RELEASE_CONTEXT_CHANNEL_FORBIDDEN');
    }
  } else {
    fail('RELEASE_CONTEXT_EVENT_INVALID');
  }
  if (
    releaseSha !== canonicalHead ||
    releaseSha !== canonicalEvent ||
    releaseSha !== canonicalMain
  ) {
    fail('RELEASE_CONTEXT_SHA_MISMATCH');
  }
  return Object.freeze({
    schema: RELEASE_CONTEXT_SCHEMA,
    browser,
    event: releaseEvent,
    releaseSha,
    mainSha: canonicalMain,
    packageVersion: version,
    tag: releaseEvent === 'push-tag' ? `v${version}` : null,
    channel: releaseChannel
  });
}
