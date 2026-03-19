import { chromium, type Page, type BrowserContext, type Worker } from '@playwright/test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

type OptionsResult = {
  type: 'options';
  url: string;
  hasShell: boolean;
  hasSidebar: boolean;
  rootHidden: boolean | null;
  bodyMargin: string;
  bodyMinHeight: string;
  bodyClasses: string[];
  screenshot: string;
};

type SupportPromptResult = {
  type: 'supportPrompt';
  site: string;
  url: string;
  promptSheetCount: number;
  toastSheetCount: number;
  promptText: string | null;
  toastText: string | null;
  screenshot: string;
};

type ReaderResult = {
  type: 'reader';
  site: string;
  url: string;
  dialogSheetCount: number;
  panelSheetCount: number;
  dialogButtons: string[];
  panelText: string | null;
  screenshot: string;
};

type VideoResult = {
  type: 'video';
  site: string;
  url: string;
  title: string;
  hasPromptHost: boolean;
  sheetCount: number;
  promptText: string | null;
  videoCount: number;
  note: string | null;
  screenshot: string;
};

type RegressionResults = {
  executedAt: string;
  extensionPath: string;
  outputDir: string;
  options: OptionsResult;
  supportPrompt: SupportPromptResult[];
  reader: ReaderResult[];
  video: VideoResult[];
};

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..', '..');
const extensionPath = path.join(repoRoot, 'build', 'dist');
const args = new Set(process.argv.slice(2));
const headedMode = args.has('--headed');
const outputDirName = headedMode ? 'real-extension-headed' : 'real-extension';
const outputDir = path.join(repoRoot, 'tmp', 'manual-browser-regression', outputDirName);

async function resolveServiceWorker(context: BrowserContext): Promise<Worker> {
  let [serviceWorker] = context.serviceWorkers();
  if (!serviceWorker) {
    serviceWorker = await context.waitForEvent('serviceworker', { timeout: 15000 });
  }
  return serviceWorker;
}

async function injectContentScript(page: Page, serviceWorker: Worker): Promise<void> {
  await page.bringToFront();
  await page.waitForTimeout(800);
  await serviceWorker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) {
      throw new Error('Active tab not found for content script injection.');
    }
    await chrome.scripting.executeScript({
      target: { tabId: tab.id, frameIds: [0] },
      files: ['content/index.js'],
      world: 'ISOLATED'
    });
  });
}

async function sendTabMessage<T>(serviceWorker: Worker, message: Record<string, unknown>): Promise<T> {
  return serviceWorker.evaluate(async (payload) => {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) {
      throw new Error('Active tab not found for runtime message.');
    }
    return chrome.tabs.sendMessage(tab.id, payload, { frameId: 0 }) as Promise<T>;
  }, message);
}

async function validateOptionsPage(context: BrowserContext, extensionId: string): Promise<OptionsResult> {
  const page = await context.newPage();
  const url = `chrome-extension://${extensionId}/options/index.html`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.locator('#optionsShellRoot .aobx-shell').waitFor({ timeout: 15000 });

  const result = await page.evaluate(() => {
    const root = document.getElementById('optionsShellRoot');
    const shell = document.querySelector('#optionsShellRoot .aobx-shell');
    const sidebar = document.querySelector('.aobx-shell__sidebar');
    const bodyStyle = getComputedStyle(document.body);
    return {
      url: location.href,
      hasShell: Boolean(shell),
      hasSidebar: Boolean(sidebar),
      rootHidden: root?.hasAttribute('hidden') ?? null,
      bodyMargin: bodyStyle.margin,
      bodyMinHeight: bodyStyle.minHeight,
      bodyClasses: Array.from(document.body.classList)
    };
  });

  const screenshot = path.join(outputDir, 'options-first-open.png');
  await page.screenshot({ path: screenshot, fullPage: true });
  await page.close();

  return {
    type: 'options',
    ...result,
    screenshot
  };
}

async function triggerSupportPrompt(page: Page, serviceWorker: Worker): Promise<{
  promptSheetCount: number;
  promptText: string | null;
  toastSheetCount: number;
  toastText: string | null;
}> {
  await sendTabMessage(serviceWorker, {
    type: 'SHOW_SUPPORT_PROMPT',
    status: 'success',
    vaultName: 'Main Vault'
  });

  await page.waitForFunction(() => {
    const host = Array.from(document.body.children).find(
      (element) => element instanceof HTMLDivElement && element.shadowRoot?.querySelector('[data-role="like-btn"]')
    );
    return Boolean(host);
  }, { timeout: 15000 });

  const prompt = await page.evaluate(() => {
    const host = Array.from(document.body.children).find(
      (element) => element instanceof HTMLDivElement && element.shadowRoot?.querySelector('[data-role="like-btn"]')
    );
    if (!(host instanceof HTMLDivElement) || !host.shadowRoot) {
      throw new Error('SupportPrompt host not found.');
    }
    return {
      promptSheetCount: host.shadowRoot.adoptedStyleSheets?.length ?? -1,
      promptText: host.shadowRoot.textContent?.trim().slice(0, 200) ?? null
    };
  });

  await page.evaluate(() => {
    const host = Array.from(document.body.children).find(
      (element) => element instanceof HTMLDivElement && element.shadowRoot?.querySelector('[data-role="like-btn"]')
    );
    const button = host instanceof HTMLDivElement
      ? host.shadowRoot?.querySelector('[data-role="like-btn"]')
      : null;
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error('SupportPrompt like button not found.');
    }
    button.click();
  });

  await page.waitForFunction(
    () => Boolean(document.getElementById('aiob-support-toast-host')?.shadowRoot?.getElementById('aiob-support-toast')),
    { timeout: 15000 }
  );

  const toast = await page.evaluate(() => {
    const host = document.getElementById('aiob-support-toast-host');
    const toastElement = host?.shadowRoot?.getElementById('aiob-support-toast');
    return {
      toastSheetCount: host?.shadowRoot?.adoptedStyleSheets?.length ?? -1,
      toastText: toastElement?.textContent?.trim().slice(0, 200) ?? null
    };
  });

  return { ...prompt, ...toast };
}

async function validateSupportPrompt(
  context: BrowserContext,
  serviceWorker: Worker,
  site: string,
  url: string,
  screenshotName: string
): Promise<SupportPromptResult> {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await injectContentScript(page, serviceWorker);

  const promptResult = await triggerSupportPrompt(page, serviceWorker);
  const screenshot = path.join(outputDir, screenshotName);
  await page.screenshot({ path: screenshot, fullPage: true });
  const pageUrl = page.url();
  await page.close();

  return {
    type: 'supportPrompt',
    site,
    url: pageUrl,
    ...promptResult,
    screenshot
  };
}

async function selectFirstMeaningfulParagraph(page: Page, selector: string): Promise<void> {
  await page.evaluate((paragraphSelector) => {
    const candidates = Array.from(document.querySelectorAll(paragraphSelector));
    const paragraph = candidates.find(
      (element) => (element.textContent ?? '').trim().length > 80
    );
    if (!paragraph) {
      throw new Error(`No paragraph matched selector: ${paragraphSelector}`);
    }

    const textNode = Array.from(paragraph.childNodes).find(
      (node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim().length > 30
    ) ?? paragraph.firstChild;

    if (!textNode) {
      throw new Error('Paragraph text node missing.');
    }

    const text = textNode.textContent ?? '';
    const start = Math.max(0, text.search(/\S/));
    const end = Math.min(text.length, start + 80);
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, Math.max(start + 30, end));

    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
  }, selector);
}

async function validateReaderFlow(
  context: BrowserContext,
  serviceWorker: Worker,
  site: string,
  url: string,
  paragraphSelector: string,
  screenshotName: string
): Promise<ReaderResult> {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await injectContentScript(page, serviceWorker);
  await selectFirstMeaningfulParagraph(page, paragraphSelector);

  await sendTabMessage<{ success: boolean }>(serviceWorker, { action: 'clipSelection', frameId: 0 });
  await page.waitForFunction(() => Boolean(document.getElementById('obsidian-clipper-dialog')?.shadowRoot), {
    timeout: 15000
  });

  const dialogInfo = await page.evaluate(() => {
    const host = document.getElementById('obsidian-clipper-dialog');
    if (!host?.shadowRoot) {
      throw new Error('Clipper dialog host missing.');
    }

    const dialogButtons = Array.from(host.shadowRoot.querySelectorAll('button')).map((button) =>
      button.textContent?.trim() ?? ''
    );

    return {
      dialogSheetCount: host.shadowRoot.adoptedStyleSheets?.length ?? -1,
      dialogButtons
    };
  });

  await page.evaluate(() => {
    const host = document.getElementById('obsidian-clipper-dialog');
    const button = host?.shadowRoot
      ? Array.from(host.shadowRoot.querySelectorAll('button'))[0]
      : null;
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error('Reader entry button missing in clipper dialog.');
    }
    button.click();
  });

  await page.waitForFunction(() => {
    const hosts = Array.from(document.body.children).filter(
      (element) => element instanceof HTMLDivElement && !!element.shadowRoot
    );
    return hosts.some((host) => host.shadowRoot?.querySelector('[data-role="highlight-item"]'));
  }, { timeout: 15000 });

  const panelInfo = await page.evaluate(() => {
    const host = Array.from(document.body.children).find(
      (element) => element instanceof HTMLDivElement && element.shadowRoot?.querySelector('[data-role="highlight-item"]')
    );
    if (!(host instanceof HTMLDivElement) || !host.shadowRoot) {
      throw new Error('Reader panel host not found.');
    }
    return {
      panelSheetCount: host.shadowRoot.adoptedStyleSheets?.length ?? -1,
      panelText: host.shadowRoot.textContent?.trim().slice(0, 220) ?? null
    };
  });

  const screenshot = path.join(outputDir, screenshotName);
  await page.screenshot({ path: screenshot, fullPage: true });
  const pageUrl = page.url();
  await page.close();

  return {
    type: 'reader',
    site,
    url: pageUrl,
    ...dialogInfo,
    ...panelInfo,
    screenshot
  };
}

async function validateVideoPrompt(
  context: BrowserContext,
  serviceWorker: Worker,
  site: string,
  url: string,
  screenshotName: string,
  waitMs = 6000
): Promise<VideoResult> {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(waitMs);
  await injectContentScript(page, serviceWorker);
  await page.waitForTimeout(waitMs);

  const result = await page.evaluate(() => {
    const host = Array.from(document.body.children).find(
      (element) => element instanceof HTMLDivElement && element.shadowRoot?.querySelector('#aiob-video-floating-prompt')
    );
    const prompt = host instanceof HTMLDivElement
      ? host.shadowRoot?.querySelector('#aiob-video-floating-prompt')
      : null;

    let note: string | null = null;
    if (!host) {
      note = document.querySelectorAll('video').length === 0
        ? 'No playable <video> element detected in this Chromium sample.'
        : 'Prompt host missing after content script injection.';
    }

    return {
      url: location.href,
      title: document.title,
      hasPromptHost: Boolean(host),
      sheetCount: host instanceof HTMLDivElement ? host.shadowRoot?.adoptedStyleSheets?.length ?? -1 : -1,
      promptText: prompt?.textContent?.trim().slice(0, 200) ?? null,
      videoCount: document.querySelectorAll('video').length,
      note
    };
  });

  const screenshot = path.join(outputDir, screenshotName);
  await page.screenshot({ path: screenshot, fullPage: true });
  await page.close();

  return {
    type: 'video',
    site,
    ...result,
    screenshot
  };
}

async function main(): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const userDataDir = await mkdtemp(path.join(os.tmpdir(), 'aiiob-real-ext-'));

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chromium',
    headless: !headedMode,
    args: [
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const serviceWorker = await resolveServiceWorker(context);
    const extensionId = serviceWorker.url().split('/')[2];

    const results: RegressionResults = {
      executedAt: new Date().toISOString(),
      extensionPath,
      outputDir,
      options: await validateOptionsPage(context, extensionId),
      supportPrompt: [
        await validateSupportPrompt(
          context,
          serviceWorker,
          'wikipedia',
          'https://en.wikipedia.org/wiki/Web_browser',
          'support-prompt-wikipedia.png'
        ),
        await validateSupportPrompt(
          context,
          serviceWorker,
          'mdn',
          'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
          'support-prompt-mdn.png'
        )
      ],
      reader: [
        await validateReaderFlow(
          context,
          serviceWorker,
          'wikipedia',
          'https://en.wikipedia.org/wiki/Web_browser',
          '#mw-content-text p, article p, main p',
          'reader-wikipedia.png'
        ),
        await validateReaderFlow(
          context,
          serviceWorker,
          'mdn',
          'https://developer.mozilla.org/en-US/docs/Web/JavaScript',
          'article p, main p',
          'reader-mdn.png'
        )
      ],
      video: [
        await validateVideoPrompt(
          context,
          serviceWorker,
          'youtube',
          'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
          'video-youtube.png',
          5000
        ),
        await validateVideoPrompt(
          context,
          serviceWorker,
          'bilibili',
          'https://www.bilibili.com/video/BV1xx411c7mD',
          'video-bilibili.png',
          6000
        )
      ]
    };

    const outputFile = path.join(outputDir, 'real-extension-regression-results.json');
    await writeFile(outputFile, `${JSON.stringify(results, null, 2)}\n`, 'utf8');
    console.log(JSON.stringify({ outputFile, results }, null, 2));
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
