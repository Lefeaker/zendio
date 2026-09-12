import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { lstat, mkdir, realpath, rm } from 'node:fs/promises';
import { WebSocket } from 'ws';
import { resolveFirefoxBrowserInput } from '../config/commandBoundaryProfiles.mjs';
import {
  assertVerifiedFirefoxArtifactBinding,
  getVerifiedFirefoxArtifactSnapshots
} from './firefoxReleaseArtifactManifest.mjs';

export const FIREFOX_WEBDRIVER_BIDI_SMOKE_SCHEMA = 'webdriver-bidi-v1';
export const FIREFOX_XPI_SMOKE_TIMEOUTS = Object.freeze({
  driverStartMs: 30_000,
  sessionMs: 120_000,
  installMs: 60_000,
  bootstrapMs: 60_000,
  uninstallMs: 30_000,
  sessionStatusMs: 30_000,
  sessionDeleteMs: 30_000,
  gracefulCloseMs: 20_000,
  forcedCloseMs: 10_000,
  cleanupMs: 30_000,
  wholeMs: 420_000
});

const DRIVER_RESPONSE_LIMIT = 1024 * 1024;
const DRIVER_LOG_LIMIT = 64 * 1024;
const ADDON_MANAGER_IDENTITY_SCRIPT = `
const done = arguments[arguments.length - 1];
const expectedId = arguments[0];
const { AddonManager } = ChromeUtils.importESModule('resource://gre/modules/AddonManager.sys.mjs');
AddonManager.getAddonByID(expectedId).then(
  (addon) => done(addon ? {
    id: addon.id,
    version: addon.version,
    isActive: addon.isActive,
    appDisabled: addon.appDisabled,
    userDisabled: addon.userDisabled
  } : null),
  () => done(null)
);`;

function fail(code, detail = '') {
  throw new Error(detail ? `${code}:${detail}` : code);
}

function sleep(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

function createDeadline(dependencies = {}) {
  const now = dependencies.now ?? Date.now;
  const setTimer = dependencies.setTimeoutOperation ?? setTimeout;
  const clearTimer = dependencies.clearTimeoutOperation ?? clearTimeout;
  const startedAt = now();
  let fenced = false;
  const remaining = () => FIREFOX_XPI_SMOKE_TIMEOUTS.wholeMs - (now() - startedAt);
  return {
    get fenced() {
      return fenced;
    },
    fence() {
      fenced = true;
    },
    remaining,
    async run(operation, operationMs, code, { allowFenced = false } = {}) {
      if (fenced && !allowFenced) fail('FIREFOX_SMOKE_LATE_OPERATION');
      const available = remaining();
      if (available <= 0) {
        fenced = true;
        fail('FIREFOX_SMOKE_WHOLE_TIMEOUT');
      }
      let timer;
      const pending = Promise.resolve().then(operation);
      pending.catch(() => undefined);
      try {
        return await Promise.race([
          pending,
          new Promise((_, reject) => {
            timer = setTimer(
              () => {
                fenced = true;
                reject(new Error(available < operationMs ? 'FIREFOX_SMOKE_WHOLE_TIMEOUT' : code));
              },
              Math.min(operationMs, available)
            );
          })
        ]);
      } finally {
        clearTimer(timer);
      }
    }
  };
}

async function allocateLoopbackPort() {
  const server = createServer();
  await new Promise((resolvePromise, rejectPromise) => {
    server.once('error', rejectPromise);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise((resolvePromise, rejectPromise) => {
    server.close((error) => (error ? rejectPromise(error) : resolvePromise()));
  });
  if (!Number.isInteger(port) || port < 1024 || port > 65535) fail('FIREFOX_SMOKE_PORT');
  return port;
}

function createCloseObserver(child) {
  let listener;
  let result =
    child.exitCode != null || child.signalCode != null
      ? { code: child.exitCode ?? null, signal: child.signalCode ?? null }
      : null;
  const promise = new Promise((resolvePromise) => {
    if (result) {
      resolvePromise(result);
      return;
    }
    listener = (code, signal) => {
      result = { code, signal };
      resolvePromise(result);
    };
    child.once('close', listener);
  });
  return {
    promise,
    hasClosed: () => result !== null,
    result: () => result,
    remove: () => {
      if (listener) child.removeListener('close', listener);
    }
  };
}

function assertDriverOpen(closeObserver) {
  if (!closeObserver.hasClosed()) return;
  const result = closeObserver.result();
  fail(
    'FIREFOX_SMOKE_DRIVER_CLOSED',
    `code=${String(result?.code ?? 'null')},signal=${String(result?.signal ?? 'null')}`
  );
}

async function runManagedOperation(operation, closeObserver) {
  assertDriverOpen(closeObserver);
  const result = await Promise.race([
    Promise.resolve().then(operation),
    closeObserver.promise.then(() => assertDriverOpen(closeObserver))
  ]);
  assertDriverOpen(closeObserver);
  return result;
}

function captureBounded(stream) {
  let bytes = Buffer.alloc(0);
  stream?.on('data', (chunk) => {
    if (bytes.length >= DRIVER_LOG_LIMIT) return;
    const remaining = DRIVER_LOG_LIMIT - bytes.length;
    bytes = Buffer.concat([bytes, Buffer.from(chunk).subarray(0, remaining)]);
  });
  return () => bytes.toString('utf8');
}

async function readBoundedJson(response) {
  if (!response.body) fail('FIREFOX_SMOKE_DRIVER_RESPONSE');
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const row = await reader.read();
      if (row.done) break;
      const bytes = Buffer.from(row.value);
      total += bytes.length;
      if (total > DRIVER_RESPONSE_LIMIT) {
        await reader.cancel().catch(() => undefined);
        fail('FIREFOX_SMOKE_DRIVER_RESPONSE_LIMIT');
      }
      chunks.push(bytes);
    }
  } finally {
    reader.releaseLock();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    fail('FIREFOX_SMOKE_DRIVER_RESPONSE');
  }
}

async function webdriverRequest(fetchImpl, deadline, url, method, body, timeoutMs) {
  const controller = new AbortController();
  return deadline
    .run(
      async () => {
        const response = await fetchImpl(url, {
          method,
          redirect: 'error',
          signal: controller.signal,
          headers: body
            ? { Accept: 'application/json', 'Content-Type': 'application/json' }
            : { Accept: 'application/json' },
          body: body ? JSON.stringify(body) : undefined
        });
        const value = await readBoundedJson(response);
        if (!response.ok || value?.value?.error) {
          fail('FIREFOX_SMOKE_WEBDRIVER_ERROR', value?.value?.error ?? String(response.status));
        }
        return value;
      },
      timeoutMs,
      'FIREFOX_SMOKE_WEBDRIVER_TIMEOUT'
    )
    .catch((error) => {
      controller.abort();
      throw error;
    });
}

async function waitForDriver(fetchImpl, deadline, driverUrl, closeObserver, sleepImpl) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < FIREFOX_XPI_SMOKE_TIMEOUTS.driverStartMs) {
    if (closeObserver.hasClosed()) {
      const result = closeObserver.result();
      fail(
        'FIREFOX_SMOKE_DRIVER_CLOSED',
        `code=${String(result?.code ?? 'null')},signal=${String(result?.signal ?? 'null')}`
      );
    }
    try {
      const response = await webdriverRequest(
        fetchImpl,
        deadline,
        new URL('status', driverUrl),
        'GET',
        undefined,
        2_000
      );
      if (response?.value?.ready === true) return;
    } catch (error) {
      if (!['FIREFOX_SMOKE_WEBDRIVER_TIMEOUT'].includes(error?.message)) {
        const cause = error?.cause?.code ?? error?.code;
        if (!['ECONNREFUSED', 'UND_ERR_SOCKET'].includes(cause)) throw error;
      }
    }
    await sleepImpl(100);
  }
  fail('FIREFOX_SMOKE_DRIVER_START_TIMEOUT');
}

function validateWebSocketUrl(value, websocketPort, sessionId) {
  let url;
  try {
    url = new URL(value);
  } catch {
    fail('FIREFOX_SMOKE_BIDI_URL');
  }
  if (
    url.protocol !== 'ws:' ||
    url.hostname !== '127.0.0.1' ||
    Number(url.port) !== websocketPort ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== `/session/${sessionId}`
  ) {
    fail('FIREFOX_SMOKE_BIDI_URL');
  }
  return url.href;
}

class BidiClient {
  constructor(WebSocketImpl, url, deadline) {
    this.socket = new WebSocketImpl(url);
    this.deadline = deadline;
    this.nextId = 1;
    this.pending = new Map();
    this.socket.on('message', (payload) => this.onMessage(payload));
    this.socket.on('close', () => this.closePending('FIREFOX_SMOKE_BIDI_CLOSED'));
    this.socket.on('error', () => this.closePending('FIREFOX_SMOKE_BIDI_ERROR'));
  }

  async open() {
    if (this.socket.readyState === 1) return;
    const opened = new Promise((resolvePromise, rejectPromise) => {
      const onOpen = () => {
        this.socket.off('error', onError);
        resolvePromise();
      };
      const onError = () => {
        this.socket.off('open', onOpen);
        rejectPromise(new Error('FIREFOX_SMOKE_BIDI_CONNECT'));
      };
      this.socket.once('open', onOpen);
      this.socket.once('error', onError);
    });
    await this.deadline.run(
      () => opened,
      FIREFOX_XPI_SMOKE_TIMEOUTS.sessionMs,
      'FIREFOX_SMOKE_BIDI_CONNECT_TIMEOUT'
    );
  }

  onMessage(payload) {
    let message;
    try {
      message = JSON.parse(Buffer.from(payload).toString('utf8'));
    } catch {
      this.closePending('FIREFOX_SMOKE_BIDI_PROTOCOL');
      return;
    }
    if (!Number.isSafeInteger(message?.id)) return;
    const record = this.pending.get(message.id);
    if (!record) return;
    this.pending.delete(message.id);
    clearTimeout(record.timer);
    if (message.type === 'success') record.resolve(message.result ?? {});
    else record.reject(new Error(`FIREFOX_SMOKE_BIDI_COMMAND:${message.error ?? 'unknown'}`));
  }

  closePending(code) {
    for (const record of this.pending.values()) {
      clearTimeout(record.timer);
      record.reject(new Error(code));
    }
    this.pending.clear();
  }

  command(method, params, timeoutMs) {
    if (this.socket.readyState !== 1) {
      return Promise.reject(new Error('FIREFOX_SMOKE_BIDI_CLOSED'));
    }
    const id = this.nextId;
    this.nextId += 1;
    return new Promise((resolvePromise, rejectPromise) => {
      const timer = setTimeout(
        () => {
          this.pending.delete(id);
          rejectPromise(new Error('FIREFOX_SMOKE_BIDI_COMMAND_TIMEOUT'));
        },
        Math.min(timeoutMs, this.deadline.remaining())
      );
      this.pending.set(id, { resolve: resolvePromise, reject: rejectPromise, timer });
      this.socket.send(JSON.stringify({ id, method, params }), (error) => {
        if (!error) return;
        clearTimeout(timer);
        this.pending.delete(id);
        rejectPromise(error);
      });
    });
  }

  async close() {
    if ([2, 3].includes(this.socket.readyState)) return;
    try {
      await this.deadline.run(
        () =>
          new Promise((resolvePromise) => {
            this.socket.once('close', resolvePromise);
            this.socket.close(1000);
          }),
        FIREFOX_XPI_SMOKE_TIMEOUTS.gracefulCloseMs,
        'FIREFOX_SMOKE_BIDI_CLOSE_TIMEOUT',
        { allowFenced: true }
      );
    } catch {
      this.socket.terminate?.();
    }
  }
}

async function setFirefoxContext(fetchImpl, deadline, driverUrl, sessionId, context) {
  await webdriverRequest(
    fetchImpl,
    deadline,
    new URL(`session/${encodeURIComponent(sessionId)}/moz/context`, driverUrl),
    'POST',
    { context },
    FIREFOX_XPI_SMOKE_TIMEOUTS.sessionStatusMs
  );
}

async function waitForBootstrapIdentity({
  fetchImpl,
  deadline,
  driverUrl,
  sessionId,
  closeObserver,
  geckoId,
  manifestVersion,
  sleepImpl,
  nowImpl
}) {
  const startedAt = nowImpl();
  while (nowImpl() - startedAt < FIREFOX_XPI_SMOKE_TIMEOUTS.bootstrapMs) {
    await runManagedOperation(
      () => setFirefoxContext(fetchImpl, deadline, driverUrl, sessionId, 'chrome'),
      closeObserver
    );
    let identity;
    try {
      const response = await runManagedOperation(
        () =>
          webdriverRequest(
            fetchImpl,
            deadline,
            new URL(`session/${encodeURIComponent(sessionId)}/execute/async`, driverUrl),
            'POST',
            { script: ADDON_MANAGER_IDENTITY_SCRIPT, args: [geckoId] },
            FIREFOX_XPI_SMOKE_TIMEOUTS.sessionStatusMs
          ),
        closeObserver
      );
      identity = response?.value;
    } finally {
      await runManagedOperation(
        () => setFirefoxContext(fetchImpl, deadline, driverUrl, sessionId, 'content'),
        closeObserver
      );
    }
    if (
      identity?.id === geckoId &&
      identity.version === manifestVersion &&
      identity.isActive === true &&
      identity.appDisabled === false &&
      identity.userDisabled === false
    ) {
      return;
    }
    await sleepImpl(100);
  }
  fail('FIREFOX_SMOKE_BOOTSTRAP_IDENTITY_TIMEOUT');
}

async function assertAbsent(path) {
  try {
    await lstat(path);
    fail('FIREFOX_SMOKE_PROFILE_EXISTS');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
}

function assertDriverEnvironment(environment, attemptRoot, browsersPath) {
  const expected = {
    CI: '1',
    HOME: join(attemptRoot, 'home'),
    LANG: 'C',
    LC_ALL: 'C',
    PATH: `${dirname(process.execPath)}:/usr/bin:/bin`,
    PLAYWRIGHT_BROWSERS_PATH: browsersPath,
    TEMP: join(attemptRoot, 'tmp'),
    TMP: join(attemptRoot, 'tmp'),
    TMPDIR: join(attemptRoot, 'tmp'),
    TZ: 'UTC'
  };
  if (
    !environment ||
    typeof environment !== 'object' ||
    Array.isArray(environment) ||
    JSON.stringify(Object.keys(environment).sort()) !==
      JSON.stringify(Object.keys(expected).sort()) ||
    Object.entries(expected).some(([key, value]) => environment[key] !== value)
  ) {
    fail('FIREFOX_SMOKE_DRIVER_ENVIRONMENT');
  }
  return Object.freeze({ ...expected });
}

function signalManagedProcess(child, signal, killProcessGroupImpl) {
  if (!Number.isSafeInteger(child.pid) || child.pid <= 0) fail('FIREFOX_SMOKE_DRIVER_PROCESS');
  if (process.platform === 'win32') child.kill(signal);
  else killProcessGroupImpl(-child.pid, signal);
}

async function stopManagedProcess(child, closeObserver, deadline, killProcessGroupImpl) {
  if (closeObserver.hasClosed()) return;
  signalManagedProcess(child, 'SIGTERM', killProcessGroupImpl);
  try {
    await deadline.run(
      () => closeObserver.promise,
      FIREFOX_XPI_SMOKE_TIMEOUTS.gracefulCloseMs,
      'FIREFOX_SMOKE_GRACEFUL_CLOSE_TIMEOUT',
      { allowFenced: true }
    );
    return;
  } catch {
    if (closeObserver.hasClosed()) return;
  }
  signalManagedProcess(child, 'SIGKILL', killProcessGroupImpl);
  await deadline.run(
    () => closeObserver.promise,
    FIREFOX_XPI_SMOKE_TIMEOUTS.forcedCloseMs,
    'FIREFOX_SMOKE_FORCED_CLOSE_TIMEOUT',
    { allowFenced: true }
  );
}

export async function runVerifiedFirefoxXpiSmoke(options, dependencies = {}) {
  const {
    binding,
    firefoxExecutable,
    geckodriverExecutable,
    profileRoot,
    transportMode,
    driverEnvironment,
    browserInput: initialBrowserInput
  } = options;
  assertVerifiedFirefoxArtifactBinding(binding);
  if (binding.transportMode !== transportMode) fail('FIREFOX_SMOKE_TRANSPORT_MODE');
  if (
    !isAbsolute(firefoxExecutable) ||
    !isAbsolute(geckodriverExecutable) ||
    dirname(dirname(geckodriverExecutable)) !== binding.attemptRoot
  ) {
    fail('FIREFOX_SMOKE_EXECUTABLE');
  }
  if (
    !isAbsolute(profileRoot) ||
    resolve(profileRoot) !== profileRoot ||
    dirname(profileRoot) !== binding.attemptRoot
  ) {
    fail('FIREFOX_SMOKE_PROFILE_PATH');
  }
  const privateBrowsersPath = join(binding.attemptRoot, 'playwright-browsers');
  const browsersPath = driverEnvironment?.PLAYWRIGHT_BROWSERS_PATH;
  if (initialBrowserInput && initialBrowserInput.browsersPath !== browsersPath)
    fail('FIREFOX_SMOKE_DRIVER_ENVIRONMENT');
  const browserInput =
    browsersPath === privateBrowsersPath
      ? null
      : resolveFirefoxBrowserInput(
          {
            attemptRoot: binding.attemptRoot,
            browsersPath,
            transportMode,
            environment: process.env,
            initialInput: initialBrowserInput
          },
          dependencies.browserInputOperations
        );
  if (browserInput && firefoxExecutable !== browserInput.firefoxExecutable)
    fail('FIREFOX_SMOKE_EXECUTABLE');
  const closedDriverEnvironment = assertDriverEnvironment(
    driverEnvironment,
    binding.attemptRoot,
    browsersPath
  );
  await assertAbsent(profileRoot);
  await mkdir(profileRoot, { mode: 0o700 });
  const profileStat = await lstat(profileRoot);
  if (
    !profileStat.isDirectory() ||
    profileStat.isSymbolicLink() ||
    profileStat.uid !== process.getuid?.() ||
    (profileStat.mode & 0o777) !== 0o700 ||
    (await realpath(profileRoot)) !== profileRoot
  ) {
    fail('FIREFOX_SMOKE_PROFILE_MODE');
  }

  const allocatePortImpl = dependencies.allocatePortImpl ?? allocateLoopbackPort;
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;
  const spawnImpl = dependencies.spawnImpl ?? spawn;
  const WebSocketImpl = dependencies.WebSocketImpl ?? WebSocket;
  const sleepImpl = dependencies.sleepImpl ?? sleep;
  const nowImpl = dependencies.now ?? Date.now;
  const killProcessGroupImpl = dependencies.killProcessGroupImpl ?? process.kill.bind(process);
  const snapshots = getVerifiedFirefoxArtifactSnapshots(binding);
  const deadline = createDeadline(dependencies);
  const [driverPort, websocketPort] = await Promise.all([allocatePortImpl(), allocatePortImpl()]);
  if (driverPort === websocketPort) fail('FIREFOX_SMOKE_PORT_ALIAS');
  const driverUrl = new URL(`http://127.0.0.1:${driverPort}/`);
  if (browserInput) {
    try {
      resolveFirefoxBrowserInput(
        {
          attemptRoot: binding.attemptRoot,
          browsersPath,
          transportMode,
          environment: process.env,
          initialInput: browserInput
        },
        dependencies.browserInputOperations
      );
    } catch (error) {
      await rm(profileRoot, { recursive: true });
      throw error;
    }
  }
  const child = spawnImpl(
    geckodriverExecutable,
    [
      '--host',
      '127.0.0.1',
      '--port',
      String(driverPort),
      '--websocket-port',
      String(websocketPort),
      '--profile-root',
      profileRoot,
      '--allow-system-access',
      '--log',
      'error'
    ],
    {
      cwd: binding.attemptRoot,
      env: closedDriverEnvironment,
      detached: process.platform !== 'win32',
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    }
  );
  if (!Number.isSafeInteger(child?.pid) || child.pid <= 0) fail('FIREFOX_SMOKE_DRIVER_PROCESS');
  const closeObserver = createCloseObserver(child);
  const readStdout = captureBounded(child.stdout);
  const readStderr = captureBounded(child.stderr);
  let sessionId;
  let bidi;
  let lifecycleComplete = false;
  try {
    await waitForDriver(fetchImpl, deadline, driverUrl, closeObserver, sleepImpl);
    const session = await runManagedOperation(
      () =>
        webdriverRequest(
          fetchImpl,
          deadline,
          new URL('session', driverUrl),
          'POST',
          {
            capabilities: {
              alwaysMatch: {
                browserName: 'firefox',
                acceptInsecureCerts: false,
                webSocketUrl: true,
                'moz:firefoxOptions': {
                  binary: firefoxExecutable,
                  args: ['-headless']
                }
              }
            }
          },
          FIREFOX_XPI_SMOKE_TIMEOUTS.sessionMs
        ),
      closeObserver
    );
    sessionId = session?.value?.sessionId;
    if (typeof sessionId !== 'string' || sessionId.length === 0) {
      fail('FIREFOX_SMOKE_SESSION_ID');
    }
    if (
      browserInput &&
      session?.value?.capabilities?.browserVersion !== browserInput.browserVersion
    )
      fail('FIREFOX_SMOKE_BROWSER_VERSION');
    const webSocketUrl = validateWebSocketUrl(
      session?.value?.capabilities?.webSocketUrl,
      websocketPort,
      sessionId
    );
    bidi = new BidiClient(WebSocketImpl, webSocketUrl, deadline);
    await runManagedOperation(() => bidi.open(), closeObserver);
    const status = await runManagedOperation(
      () => bidi.command('session.status', {}, FIREFOX_XPI_SMOKE_TIMEOUTS.sessionStatusMs),
      closeObserver
    );
    if (typeof status?.ready !== 'boolean') fail('FIREFOX_SMOKE_SESSION_STATUS');
    const first = await runManagedOperation(
      () =>
        bidi.command(
          'webExtension.install',
          { extensionData: { type: 'archivePath', path: binding.xpiPath } },
          FIREFOX_XPI_SMOKE_TIMEOUTS.installMs
        ),
      closeObserver
    );
    if (first?.extension !== binding.geckoId) fail('FIREFOX_SMOKE_ADDON_ID');
    await waitForBootstrapIdentity({
      fetchImpl,
      deadline,
      driverUrl,
      sessionId,
      closeObserver,
      geckoId: binding.geckoId,
      manifestVersion: snapshots.manifestVersion,
      sleepImpl,
      nowImpl
    });
    await runManagedOperation(
      () =>
        bidi.command(
          'webExtension.uninstall',
          { extension: binding.geckoId },
          FIREFOX_XPI_SMOKE_TIMEOUTS.uninstallMs
        ),
      closeObserver
    );
    const second = await runManagedOperation(
      () =>
        bidi.command(
          'webExtension.install',
          { extensionData: { type: 'archivePath', path: binding.xpiPath } },
          FIREFOX_XPI_SMOKE_TIMEOUTS.installMs
        ),
      closeObserver
    );
    if (second?.extension !== binding.geckoId) fail('FIREFOX_SMOKE_ADDON_ID');
    await waitForBootstrapIdentity({
      fetchImpl,
      deadline,
      driverUrl,
      sessionId,
      closeObserver,
      geckoId: binding.geckoId,
      manifestVersion: snapshots.manifestVersion,
      sleepImpl,
      nowImpl
    });
    lifecycleComplete = true;
    return Object.freeze({
      schema: 'firefox-exact-xpi-smoke-v2',
      adapter: FIREFOX_WEBDRIVER_BIDI_SMOKE_SCHEMA,
      geckoId: binding.geckoId,
      installed: true,
      bootstrapped: true,
      uninstalled: true,
      reinstalled: true,
      rebootstrapped: true
    });
  } catch (error) {
    if (closeObserver.hasClosed()) {
      const result = closeObserver.result();
      fail(
        'FIREFOX_SMOKE_DRIVER_CLOSED',
        `code=${String(result?.code ?? 'null')},signal=${String(result?.signal ?? 'null')},stderr=${readStderr().slice(0, 256)}`
      );
    }
    throw error;
  } finally {
    deadline.fence();
    await bidi?.close().catch(() => undefined);
    if (sessionId) {
      await webdriverRequest(
        fetchImpl,
        createDeadline(dependencies),
        new URL(`session/${encodeURIComponent(sessionId)}`, driverUrl),
        'DELETE',
        undefined,
        FIREFOX_XPI_SMOKE_TIMEOUTS.sessionDeleteMs
      ).catch(() => undefined);
    }
    await stopManagedProcess(
      child,
      closeObserver,
      createDeadline(dependencies),
      killProcessGroupImpl
    );
    closeObserver.remove();
    await createDeadline(dependencies).run(
      () => rm(profileRoot, { recursive: true }),
      FIREFOX_XPI_SMOKE_TIMEOUTS.cleanupMs,
      'FIREFOX_SMOKE_PROFILE_CLEANUP_TIMEOUT',
      { allowFenced: true }
    );
    try {
      await lstat(profileRoot);
      fail('FIREFOX_SMOKE_PROFILE_CLEANUP_INCOMPLETE');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    if (!closeObserver.hasClosed()) {
      fail(
        'FIREFOX_SMOKE_PROCESS_NOT_CLOSED',
        `stdout=${readStdout().slice(0, 128)},stderr=${readStderr().slice(0, 128)},lifecycle=${String(lifecycleComplete)}`
      );
    }
  }
}
