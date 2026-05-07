#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const DEFAULT_SITES = [
  { id: 'wikipedia-ai', url: 'https://en.wikipedia.org/wiki/Artificial_intelligence' },
  { id: 'medium-ai-tag', url: 'https://medium.com/tag/artificial-intelligence' },
  { id: 'x-openai', url: 'https://x.com/OpenAI' },
  { id: 'reddit-programming', url: 'https://www.reddit.com/r/programming/' },
  { id: 'mdn-js', url: 'https://developer.mozilla.org/en-US/docs/Web/JavaScript' },
  { id: 'wechat-article', url: 'https://mp.weixin.qq.com/s/U-5PG2mF3Y5oJGea1HsD-Q' }
];

const EXTENSION_ID = process.env.AIIOB_EXTENSION_ID ?? 'eokdmdbdfmcicikpamaecbcieljedjha';
const OUT_DIR = process.argv.includes('--out')
  ? process.argv[process.argv.indexOf('--out') + 1]
  : path.join(process.cwd(), 'tmp/perf-baseline/content-cross-site-latest');
const PHASE_SETTLE_MS = Number(process.env.AIIOB_PERF_PHASE_SETTLE_MS ?? 750);
const NAVIGATION_TIMEOUT_MS = Number(process.env.AIIOB_PERF_NAVIGATION_TIMEOUT_MS ?? 45_000);
const ACTION_TIMEOUT_MS = Number(process.env.AIIOB_PERF_ACTION_TIMEOUT_MS ?? 10_000);

fs.mkdirSync(OUT_DIR, { recursive: true });

function readDevToolsWebSocketUrl() {
  const file = path.join(
    os.homedir(),
    'Library/Application Support/Google/Chrome/DevToolsActivePort'
  );
  const [port, wsPath] = fs.readFileSync(file, 'utf8').trim().split('\n');
  return `ws://127.0.0.1:${port}${wsPath}`;
}

class CdpConnection {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.listeners = new Map();
  }

  async open() {
    this.ws = new WebSocket(this.url);
    this.ws.binaryType = 'arraybuffer';
    this.ws.addEventListener('message', (event) => {
      void this.handleMessage(event.data).catch((error) => {
        console.error('[perf] failed to handle CDP message', error);
      });
    });
    await new Promise((resolve, reject) => {
      this.ws.addEventListener('open', resolve, { once: true });
      this.ws.addEventListener('error', reject, { once: true });
    });
  }

  close() {
    this.ws?.close();
  }

  send(method, params = {}, sessionId) {
    const id = this.nextId++;
    const payload = sessionId ? { id, method, params, sessionId } : { id, method, params };
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  on(method, listener) {
    const listeners = this.listeners.get(method) ?? [];
    listeners.push(listener);
    this.listeners.set(method, listeners);
    return () => {
      const next = (this.listeners.get(method) ?? []).filter((entry) => entry !== listener);
      this.listeners.set(method, next);
    };
  }

  async handleMessage(raw) {
    const text =
      typeof raw === 'string'
        ? raw
        : raw instanceof ArrayBuffer
          ? Buffer.from(raw).toString('utf8')
          : typeof raw?.text === 'function'
            ? await raw.text()
            : String(raw);
    const message = JSON.parse(text);
    if (message.id && this.pending.has(message.id)) {
      const { resolve, reject } = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) {
        reject(new Error(`${message.error.message}: ${message.error.data ?? ''}`));
      } else {
        resolve(message.result);
      }
      return;
    }
    if (message.method) {
      for (const listener of this.listeners.get(message.method) ?? []) {
        listener(message);
      }
    }
  }
}

async function main() {
  console.log('[perf] connecting to Chrome DevTools');
  const cdp = new CdpConnection(readDevToolsWebSocketUrl());
  await cdp.open();
  console.log('[perf] connected');
  const startedAt = new Date().toISOString();
  const summary = {
    generatedAt: startedAt,
    extensionId: EXTENSION_ID,
    outDir: OUT_DIR,
    sites: {}
  };

  try {
    const extensionSession = await attachExtensionServiceWorker(cdp);
    for (const site of DEFAULT_SITES) {
      console.log(`[perf] measuring ${site.id} ${site.url}`);
      summary.sites[site.id] = await measureSite(cdp, extensionSession, site);
      writeSummary(summary);
    }
  } finally {
    cdp.close();
  }

  writeSummary(summary);
  console.log(`Wrote ${path.join(OUT_DIR, 'summary.json')}`);
}

async function attachExtensionServiceWorker(cdp) {
  const targets = await cdp.send('Target.getTargets');
  console.log(`[perf] found ${targets.targetInfos.length} Chrome targets`);
  const worker = targets.targetInfos.find(
    (target) =>
      target.type === 'service_worker' &&
      target.url.startsWith(`chrome-extension://${EXTENSION_ID}/`)
  );
  if (!worker) {
    throw new Error(`AiiinOB extension service worker not found for ${EXTENSION_ID}`);
  }
  const { sessionId } = await cdp.send('Target.attachToTarget', {
    targetId: worker.targetId,
    flatten: true
  });
  return { targetId: worker.targetId, sessionId };
}

async function measureSite(cdp, extensionSession, site) {
  const { targetId } = await cdp.send('Target.createTarget', {
    url: 'about:blank',
    newWindow: false,
    background: false
  });
  const siteDir = path.join(OUT_DIR, site.id);
  fs.mkdirSync(siteDir, { recursive: true });
  const requests = [];
  let sessionId;

  try {
    ({ sessionId } = await cdp.send('Target.attachToTarget', {
      targetId,
      flatten: true
    }));
    cdp.on('Network.requestWillBeSent', (message) => {
      if (message.sessionId === sessionId) {
        requests.push({
          url: message.params.request.url,
          type: message.params.type,
          timestamp: message.params.timestamp
        });
      }
    });
    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);
    await cdp.send('Performance.enable', {}, sessionId);

    const phases = {};
    phases.load = await capturePhase(cdp, sessionId, requests, 'load', async () => {
      await cdp.send('Page.navigate', { url: site.url }, sessionId);
      await waitForPageReady(cdp, sessionId, NAVIGATION_TIMEOUT_MS);
      await sleep(PHASE_SETTLE_MS);
    });

    const exactUrl = await getCurrentUrl(cdp, sessionId);
    const tabId = await resolveExactTabId(cdp, extensionSession.sessionId, exactUrl);
    phases.clipperOpen = await capturePhase(cdp, sessionId, requests, 'clipperOpen', async () => {
      await selectReadableText(cdp, sessionId);
      await sendTabMessage(cdp, extensionSession.sessionId, tabId, { action: 'clipSelection' });
      await waitForSelector(cdp, sessionId, '#obsidian-clipper-dialog', ACTION_TIMEOUT_MS);
    });

    phases.readerStart = await capturePhase(cdp, sessionId, requests, 'readerStart', async () => {
      await clickReaderStart(cdp, sessionId);
      await waitForSelector(cdp, sessionId, '#aiob-reader-panel', ACTION_TIMEOUT_MS);
    });

    phases.fullClip = await capturePhase(cdp, sessionId, requests, 'fullClip', async () => {
      const response = await sendTabMessage(cdp, extensionSession.sessionId, tabId, {
        action: 'clipFull'
      });
      await sleep(PHASE_SETTLE_MS);
      return response;
    });

    const result = {
      id: site.id,
      requestedUrl: site.url,
      exactUrl,
      targetId,
      tabId,
      phases
    };
    fs.writeFileSync(path.join(siteDir, 'site-summary.json'), JSON.stringify(result, null, 2));
    return result;
  } catch (error) {
    return {
      id: site.id,
      requestedUrl: site.url,
      targetId,
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    await cdp.send('Target.closeTarget', { targetId }).catch(() => undefined);
  }
}

async function capturePhase(cdp, sessionId, requests, name, action) {
  const requestStart = requests.length;
  const resourceStart = await getExtensionResources(cdp, sessionId);
  const metricsStart = await getMetrics(cdp, sessionId);
  const started = performance.now();
  let response = null;
  let error = null;
  try {
    response = await action();
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  const elapsedMs = performance.now() - started;
  const metricsEnd = await getMetrics(cdp, sessionId);
  const resourceEnd = await getExtensionResources(cdp, sessionId);
  const networkUrls = requests.slice(requestStart).map((request) => request.url);
  const loadedAiobUrls = unique([
    ...networkUrls.filter(isAiobExtensionUrl),
    ...resourceEnd.filter((url) => !resourceStart.includes(url))
  ]);
  return {
    name,
    action: {
      visibleMs: error ? null : Math.round(elapsedMs),
      response,
      error,
      cpuMs: metricDeltaMs(metricsStart, metricsEnd, 'TaskDuration')
    },
    loadedAiobChunks: loadedAiobUrls.map(chunkNameFromUrl),
    loadedAiobUrls
  };
}

async function waitForPageReady(cdp, sessionId, timeoutMs) {
  await waitForExpression(
    cdp,
    sessionId,
    "document.readyState === 'interactive' || document.readyState === 'complete'",
    timeoutMs
  );
}

async function waitForSelector(cdp, sessionId, selector, timeoutMs) {
  await waitForExpression(cdp, sessionId, `Boolean(document.querySelector(${JSON.stringify(selector)}))`, timeoutMs);
}

async function waitForExpression(cdp, sessionId, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const result = await evaluate(cdp, sessionId, expression);
    if (result) {
      return;
    }
    await sleep(100);
  }
  throw new Error(`Timed out waiting for ${expression}`);
}

async function getCurrentUrl(cdp, sessionId) {
  return String(await evaluate(cdp, sessionId, 'location.href'));
}

async function selectReadableText(cdp, sessionId) {
  await evaluate(
    cdp,
    sessionId,
    `(() => {
      const candidates = Array.from(document.querySelectorAll('article p, main p, p, article, main, body'));
      const node = candidates.find((entry) => (entry.textContent || '').trim().length > 40) || document.body;
      const range = document.createRange();
      range.selectNodeContents(node);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event('selectionchange', { bubbles: true }));
      return selection.toString().length;
    })()`
  );
}

async function clickReaderStart(cdp, sessionId) {
  const clicked = await evaluate(
    cdp,
    sessionId,
    `(() => {
      const root = document.querySelector('#obsidian-clipper-dialog');
      const buttons = Array.from((root || document).querySelectorAll('button'));
      const button = buttons.find((entry) => /reader|reading|阅读|高亮|Open reader|Start/i.test(entry.textContent || ''));
      if (!button) return false;
      button.click();
      return true;
    })()`
  );
  if (!clicked) {
    throw new Error('Reader start button not found');
  }
}

async function resolveExactTabId(cdp, extensionSessionId, exactUrl) {
  const expression = `new Promise((resolve) => {
    chrome.tabs.query({}, (tabs) => {
      const tab = tabs.find((entry) => entry.url === ${JSON.stringify(exactUrl)});
      resolve(tab ? tab.id : null);
    });
  })`;
  const tabId = await evaluate(cdp, extensionSessionId, expression, true);
  if (typeof tabId !== 'number') {
    throw new Error(`No Chrome tab matched exact URL: ${exactUrl}`);
  }
  return tabId;
}

async function sendTabMessage(cdp, extensionSessionId, tabId, message) {
  const expression = `new Promise((resolve) => {
    chrome.tabs.sendMessage(${tabId}, ${JSON.stringify(message)}, (response) => {
      const error = chrome.runtime.lastError;
      resolve(error ? { success: false, error: error.message } : response);
    });
  })`;
  return await evaluate(cdp, extensionSessionId, expression, true);
}

async function getExtensionResources(cdp, sessionId) {
  return await evaluate(
    cdp,
    sessionId,
    `performance.getEntriesByType('resource')
      .map((entry) => entry.name)
      .filter((name) => name.startsWith('chrome-extension://${EXTENSION_ID}/'))`
  );
}

async function getMetrics(cdp, sessionId) {
  const result = await cdp.send('Performance.getMetrics', {}, sessionId).catch(() => ({ metrics: [] }));
  return Object.fromEntries(result.metrics.map((metric) => [metric.name, metric.value]));
}

function metricDeltaMs(before, after, name) {
  if (typeof before[name] !== 'number' || typeof after[name] !== 'number') {
    return null;
  }
  return Math.max(0, Math.round((after[name] - before[name]) * 1000));
}

async function evaluate(cdp, sessionId, expression, awaitPromise = false) {
  const result = await cdp.send(
    'Runtime.evaluate',
    {
      expression,
      awaitPromise,
      returnByValue: true,
      userGesture: true
    },
    sessionId
  );
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.text || 'Runtime.evaluate failed');
  }
  return result.result?.value;
}

function writeSummary(summary) {
  fs.writeFileSync(path.join(OUT_DIR, 'summary.json'), JSON.stringify(summary, null, 2));
}

function isAiobExtensionUrl(url) {
  return url.startsWith(`chrome-extension://${EXTENSION_ID}/`);
}

function chunkNameFromUrl(url) {
  const parsed = new URL(url);
  return decodeURIComponent(path.basename(parsed.pathname));
}

function unique(values) {
  return Array.from(new Set(values));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
