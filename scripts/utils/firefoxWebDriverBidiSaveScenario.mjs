import { createServer } from 'node:http';

const PARAGRAPH =
  'Firefox save evidence must survive a refused write and remain available for retry.';

function fail(detail) {
  throw new Error(`FIREFOX_SAVE_SCENARIO:${detail}`);
}

/** Fixed DOM scenario, using the verified smoke owner's existing browser and deadline. */
export async function runFirefoxSaveRetryScenario({ request, extensionUrl, run, sleep }) {
  let writeStatus = 500;
  let rejectedWrites = 0;
  const files = new Map();
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ method: req.method, path: req.url });
    if (req.url?.startsWith('/article')) {
      const title = req.url.includes('second') ? 'Firefox Second Save' : 'Firefox First Save';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<html><head><title>${title}</title></head><body><article><h1>${title}</h1><p id="selected">${PARAGRAPH}</p><p>${'Further research source text. '.repeat(50)}</p></article></body></html>`
      );
      return;
    }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      if (req.method === 'PUT') {
        if (writeStatus >= 400) rejectedWrites += 1;
        else files.set(decodeURIComponent(req.url ?? ''), body);
      }
      res.writeHead(req.method === 'PUT' ? writeStatus : 200, {
        'Content-Type': 'application/json'
      });
      res.end('{}');
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string') fail('REST_LISTEN');
  const endpoint = `http://127.0.0.1:${address.port}`;
  const execute = (script, args = []) => request('POST', 'execute/sync', { script, args });
  const executeAsync = (script, args = []) => request('POST', 'execute/async', { script, args });
  const until = (probe, label) =>
    run(
      async () => {
        while (!(await probe())) await sleep(100);
      },
      30_000,
      `FIREFOX_SAVE_SCENARIO_TIMEOUT:${label}`
    );
  const deepQuery = `function query(selector, root = document) {
    const direct = root.querySelector(selector); if (direct) return direct;
    for (const element of root.querySelectorAll('*')) {
      if (element.shadowRoot) { const found = query(selector, element.shadowRoot); if (found) return found; }
    }
    return null;
  }`;
  const click = async (selector) => {
    await until(
      () => execute(`${deepQuery}; return Boolean(query(arguments[0]));`, [selector]),
      selector
    );
    await execute(`${deepQuery}; query(arguments[0]).click();`, [selector]);
  };
  const hasHighlight = () =>
    execute(
      `${deepQuery}; return query('[data-role="highlight-item"]')?.textContent.includes(arguments[0]) ?? false;`,
      [PARAGRAPH]
    );
  const readStored = (key) =>
    executeAsync(
      `const done = arguments[arguments.length - 1]; browser.storage.local.get(arguments[0]).then(done, () => done(null));`,
      [key]
    );
  try {
    await request('POST', 'url', { url: `${extensionUrl}options/index.html` });
    const optionsHandle = await request('GET', 'window');
    await click('[data-nav-panel="storage"]');
    await until(
      () =>
        execute(
          `return document.querySelectorAll('.storage-vault-table-scroll tbody tr:first-child input[type="text"]').length >= 3;`
        ),
      'VAULT_FIELDS'
    );
    const values = ['Firefox Test Vault', '', endpoint, 'firefox-fixture-key'];
    for (let index = 0; index < values.length; index += 1) {
      await execute(
        `const row = document.querySelector('.storage-vault-table-scroll tbody tr');
        const fields = [...row.querySelectorAll('input[type="text"]'), row.querySelector('input[type="password"]')];
        const field = fields[arguments[0]]; field.value = arguments[1];
        field.dispatchEvent(new Event('input', { bubbles: true })); field.dispatchEvent(new Event('change', { bubbles: true }));`,
        [index, values[index]]
      );
    }
    await until(
      () =>
        executeAsync(
          `const done = arguments[arguments.length - 1];
      browser.storage.sync.get('options').then(({options}) => {
        const vault = options?.vaultRouter?.vaults?.[0]; done(vault?.httpUrl === arguments[0] && vault?.apiKey === 'firefox-fixture-key');
      }, () => done(false));`,
          [endpoint]
        ),
      'SAVED_REST_OPTIONS'
    );
    await click('[data-nav-panel="capture-behavior"]');
    await click('.selection-trigger-inline [data-value="direct"]');
    await until(
      () =>
        executeAsync(
          `const done = arguments[arguments.length - 1]; browser.storage.sync.get('options').then(({options}) => done(options?.fragmentClipper?.selectionTriggerMode === 'direct'), () => done(false));`
        ),
      'SAVED_CAPTURE_OPTIONS'
    );
    const runtimeDiagnostics = await executeAsync(`const done = arguments[arguments.length - 1];
      Promise.all([browser.permissions.getAll(), browser.scripting.getRegisteredContentScripts(), browser.runtime.getManifest()])
      .then(([permissions, scripts, manifest]) => done({ permissions, scripts, contentScripts: manifest.content_scripts }),
        (error) => done({ error: String(error) }));`);
    console.log('[firefox-save] injection inputs', JSON.stringify(runtimeDiagnostics));
    const article = await request('POST', 'window/new', { type: 'tab' });
    await request('POST', 'window', { handle: article.handle });
    const startReader = async (suffix) => {
      await request('POST', 'url', { url: `${endpoint}/article-${suffix}` });
      let runtimeObservation;
      try {
        await until(async () => {
          runtimeObservation =
            await execute(`return { url: location.href, readyState: document.readyState,
            runtime: document.documentElement.getAttribute('data-aiob-content-runtime') };`);
          return runtimeObservation.runtime === 'true';
        }, 'CONTENT_RUNTIME');
      } catch (error) {
        console.log(
          '[firefox-save] content observation',
          JSON.stringify({ runtimeObservation, requests })
        );
        throw error;
      }
      await execute(`const node = document.querySelector('#selected'); const range = document.createRange(); range.selectNodeContents(node);
        const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
        node.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0, clientX: 200, clientY: 130 }));`);
      await click('[data-action-id="reader"]');
      await until(hasHighlight, 'READER_HIGHLIGHT');
    };
    await startReader('first');
    await click('[data-role="export-btn"]');
    await until(
      async () =>
        rejectedWrites > 0 &&
        (await execute(`${deepQuery}; return !query('[data-role="export-btn"]')?.disabled;`)),
      'REST_FAILURE'
    );
    if (!(await hasHighlight()) || files.size !== 0) fail('FAILURE_DROPPED_CONTENT');
    await request('POST', 'window', { handle: optionsHandle });
    const storage = await readStored(null);
    if (!JSON.stringify(storage).includes(PARAGRAPH)) fail('FAILURE_DROPPED_DRAFT');
    await request('POST', 'window', { handle: article.handle });
    await until(
      () =>
        execute(
          `${deepQuery}; return Boolean(query('#aiob-support-prompt')?.shadowRoot?.querySelector('.task-progress-track.is-failure'));`
        ),
      'FAILURE_PROMPT'
    );
    await execute(
      `${deepQuery}; query('#aiob-support-prompt')?.shadowRoot?.querySelector('.resource-modal-overlay')?.click();`
    );
    writeStatus = 200;
    await click('[data-role="export-btn"]');
    await until(async () => files.size === 1 && !(await hasHighlight()), 'RETRY_COMPLETE');
    if (![...files.values()][0]?.includes(PARAGRAPH)) fail('RETRY_MARKDOWN');
    await startReader('second');
    await click('[data-role="export-btn"]');
    await until(async () => files.size === 2 && !(await hasHighlight()), 'REOPEN_SAVE');
    if (![...files.values()].every((value) => value.includes(PARAGRAPH))) fail('REOPEN_MARKDOWN');
    return Object.freeze({
      scenario: 'save-retry-v1',
      rejectedWrites,
      draftRetained: true,
      retrySaved: true,
      reopenedSaved: true,
      savedFiles: files.size
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}
