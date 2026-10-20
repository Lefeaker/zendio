import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ARTICLES = Object.freeze({
  first: {
    title: 'Firefox First Save',
    paragraph: 'Firefox save evidence must survive a refused write and remain available for retry.'
  },
  second: {
    title: 'Firefox Second Save',
    paragraph:
      'A fresh Firefox article must save its own distinct text after the first session ends.'
  }
});

function fail(detail) {
  throw new Error(`FIREFOX_SAVE_SCENARIO:${detail}`);
}

/** Observe the actual active draft, never an index, receipt, or unrelated page. */
export function findFirefoxReaderDraft(storage, pageUrl, paragraph, previous) {
  const matches = Object.entries(storage ?? {}).filter(([key, record]) => {
    if (!record || typeof record !== 'object') return false;
    return (
      record.schemaVersion === 2 &&
      record.mode === 'reader' &&
      record.status === 'active' &&
      record.pageUrl === pageUrl &&
      typeof record.pageKey === 'string' &&
      typeof record.draftId === 'string' &&
      record.draftId.length > 0 &&
      key ===
        `aiob.sessionDraft.v1.reader.${record.pageKey}.${encodeURIComponent(record.draftId)}` &&
      Number.isInteger(record.revision) &&
      record.revision >= 1 &&
      Array.isArray(record.payload?.highlights) &&
      record.payload.highlights.some((highlight) => highlight?.selectedText === paragraph)
    );
  });
  if (matches.length !== 1) return undefined;
  const [key, record] = matches[0];
  if (
    previous &&
    (key !== previous.key ||
      record.draftId !== previous.draftId ||
      record.revision < previous.revision)
  )
    return undefined;
  return {
    key,
    draftId: record.draftId,
    revision: record.revision,
    exportAttempt: record.payload.exportAttempt
  };
}

export function waitForFirefoxSaveScenario(probe, label, { run, sleep }) {
  const code = `FIREFOX_SAVE_SCENARIO_TIMEOUT:${label}`;
  return run(
    async () => {
      // A short-circuiting probe may never make a WebDriver request. Keep its
      // polling sleep under the same fence so a deadline cannot leave a live loop.
      while (!(await probe())) await run(() => sleep(100), 30_000, code);
    },
    30_000,
    code
  );
}

/** Fixed DOM scenario, using the verified smoke owner's existing browser and deadline. */
export async function runFirefoxSaveRetryScenario({
  request,
  extensionUrl,
  outputDirectory,
  run,
  sleep
}) {
  await mkdir(outputDirectory, { mode: 0o700 });
  let writeStatus = 500;
  let rejectedWrites = 0;
  let acceptedWrites = 0;
  const files = new Map();
  const requests = [];
  const server = createServer((req, res) => {
    requests.push({ method: req.method, path: req.url });
    if (req.url?.startsWith('/article')) {
      const { title, paragraph } = req.url.includes('second') ? ARTICLES.second : ARTICLES.first;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(
        `<html><head><title>${title}</title></head><body><article><h1>${title}</h1><p id="selected">${paragraph}</p><p>${'Further research source text. '.repeat(50)}</p></article></body></html>`
      );
      return;
    }
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', async () => {
      if (req.method === 'PUT') {
        if (writeStatus >= 400) rejectedWrites += 1;
        else {
          acceptedWrites += 1;
          const outputName = `save-${acceptedWrites}.md`;
          try {
            await writeFile(join(outputDirectory, outputName), body, { mode: 0o600, flag: 'wx' });
            files.set(decodeURIComponent(req.url ?? ''), outputName);
          } catch {
            res.writeHead(500);
            res.end('{}');
            return;
          }
        }
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
  const until = (probe, label) => waitForFirefoxSaveScenario(probe, label, { run, sleep });
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
  const hasHighlight = (paragraph) =>
    execute(
      `${deepQuery}; return query('[data-role="highlight-item"]')?.textContent.includes(arguments[0]) ?? false;`,
      // The row renders an 80-character excerpt; storage and Markdown checks retain the full text.
      [paragraph.slice(0, 60)]
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
      await until(() => hasHighlight(ARTICLES[suffix].paragraph), 'READER_HIGHLIGHT');
    };
    await startReader('first');
    await request('POST', 'window', { handle: optionsHandle });
    const firstPageUrl = `${endpoint}/article-first`;
    let initialDraft;
    await until(async () => {
      initialDraft = findFirefoxReaderDraft(
        await readStored(null),
        firstPageUrl,
        ARTICLES.first.paragraph
      );
      return Boolean(initialDraft);
    }, 'INITIAL_DURABLE_DRAFT');
    await request('POST', 'window', { handle: article.handle });
    await click('[data-role="export-btn"]');
    await until(
      async () =>
        rejectedWrites > 0 &&
        (await execute(`${deepQuery}; return !query('[data-role="export-btn"]')?.disabled;`)),
      'REST_FAILURE'
    );
    if (!(await hasHighlight(ARTICLES.first.paragraph)) || files.size !== 0)
      fail('FAILURE_DROPPED_CONTENT');
    await request('POST', 'window', { handle: optionsHandle });
    const retainedDraft = findFirefoxReaderDraft(
      await readStored(initialDraft.key),
      firstPageUrl,
      ARTICLES.first.paragraph,
      initialDraft
    );
    if (!retainedDraft) fail('FAILURE_DROPPED_DRAFT');
    const attempt = retainedDraft.exportAttempt;
    if (
      attempt?.outcome !== 'unknown' ||
      !/^op_[a-z0-9]{6,24}$/u.test(attempt.operationId ?? '') ||
      !/^[a-f0-9]{64}$/u.test(attempt.snapshotId ?? '') ||
      !Number.isFinite(attempt.startedAt) ||
      attempt.startedAt < 0
    )
      fail('FAILURE_DROPPED_UNKNOWN_ATTEMPT');
    await request('POST', 'window', { handle: article.handle });
    await until(
      () =>
        execute(
          `${deepQuery}; return Boolean(query('aside[data-session-export-notice="reader"]') && query('button[data-export-recovery="save-again"]'));`
        ),
      'UNKNOWN_RECOVERY_NOTICE'
    );
    // The support prompt is ancillary; business recovery must not depend on its delivery.
    await execute(
      `${deepQuery}; query('#aiob-support-prompt')?.shadowRoot?.querySelector('.resource-modal-overlay')?.click();`
    );
    await click('[data-role="export-btn"]');
    if (rejectedWrites !== 1 || acceptedWrites !== 0 || files.size !== 0)
      fail('UNKNOWN_FINISH_RETRIED');
    await request('POST', 'window', { handle: optionsHandle });
    const afterFinish = findFirefoxReaderDraft(
      await readStored(initialDraft.key),
      firstPageUrl,
      ARTICLES.first.paragraph,
      retainedDraft
    );
    if (
      afterFinish?.exportAttempt?.operationId !== attempt.operationId ||
      afterFinish.exportAttempt.outcome !== 'unknown'
    )
      fail('UNKNOWN_FINISH_CHANGED_ATTEMPT');
    console.log(
      '[firefox-save] retained unknown draft',
      JSON.stringify({
        key: retainedDraft.key,
        draftId: retainedDraft.draftId,
        initialRevision: initialDraft.revision,
        unknownRevision: retainedDraft.revision,
        operationId: attempt.operationId,
        snapshotId: attempt.snapshotId,
        ordinaryFinishWrites: 0
      })
    );
    await request('POST', 'window', { handle: article.handle });
    writeStatus = 200;
    await click('button[data-export-recovery="save-again"]');
    await until(
      async () => files.size === 1 && !(await hasHighlight(ARTICLES.first.paragraph)),
      'RETRY_COMPLETE'
    );
    const firstMarkdown = await readFile(join(outputDirectory, 'save-1.md'), 'utf8');
    if (!firstMarkdown.includes(ARTICLES.first.paragraph)) fail('RETRY_MARKDOWN');
    await startReader('second');
    await click('[data-role="export-btn"]');
    await until(
      async () => files.size === 2 && !(await hasHighlight(ARTICLES.second.paragraph)),
      'REOPEN_SAVE'
    );
    const secondMarkdown = await readFile(join(outputDirectory, 'save-2.md'), 'utf8');
    if (
      !secondMarkdown.includes(ARTICLES.second.paragraph) ||
      secondMarkdown.includes(ARTICLES.first.paragraph) ||
      firstMarkdown.includes(ARTICLES.second.paragraph)
    )
      fail('REOPEN_MARKDOWN');
    if (rejectedWrites !== 1 || acceptedWrites !== 2) fail('WRITE_COUNT');
    return Object.freeze({
      scenario: 'save-retry-v1',
      destination: 'loopback-rest-fixture',
      rejectedWrites,
      acceptedWrites,
      draftRetained: true,
      retrySaved: true,
      reopenedSaved: true,
      savedFiles: files.size,
      outputs: [firstMarkdown, secondMarkdown].map((markdown, index) => ({
        file: `save-${index + 1}.md`,
        bytes: Buffer.byteLength(markdown),
        sha256: createHash('sha256').update(markdown).digest('hex')
      }))
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve()))
    );
  }
}
