import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readdirSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { MessagePayload } from '../../src/platform/interfaces/messaging';
import { SECTION_INVALIDATION_SCOPES } from '../../src/ui/stitch-runtime/render/sectionInvalidation';

const ROUTING_TEMPLATE_ROWS = [
  ['routing:add', 'storage'],
  ['routing:remove', 'storage'],
  ['routing:updateField', 'storage'],
  ['routing:updatePriority', 'storage'],
  ['storage:addVault', 'storage'],
  ['storage:removeVault', 'storage'],
  ['storage:updateVaultField', 'storage'],
  ['storage:activateLocalFolder', 'storage'],
  ['storage:chooseLocalFolder', 'storage'],
  ['storage:deleteLocalFolder', 'storage'],
  ['storage:cancelLocalFolderDelete', 'storage'],
  ['storage:testConnection', 'storage'],
  ['domain:add', 'output'],
  ['domain:update', 'output'],
  ['domain:remove', 'output'],
  ['yaml:setFilter', 'output'],
  ['yaml:toggleFieldState', 'output'],
  ['template:setActiveField', 'output'],
  ['template:updateValue', 'output'],
  ['template:insertToken', 'output']
] as const;

const extensionPath = resolve(process.env.PLAYWRIGHT_DIST_DIR ?? 'build/dist');

type OrderedAutosaveProbe = {
  held: boolean;
  released: boolean;
  values: boolean[];
  release(): void;
};

type UsageResetTrace = {
  request: {
    type: 'ZENDIO_USAGE_STATS';
    requestId: string;
    operation: 'reset';
  };
  response: MessagePayload;
};

type OptionsMutationTrace = {
  request: {
    type: 'ZENDIO_OPTIONS_MUTATION';
    requestId: string;
    command: MessagePayload;
  };
  response: MessagePayload;
};

type RetryNativeProbe = {
  calls: number;
  failures: number;
  held: boolean;
  releases: number;
  release(): void;
};

type B07GlobalThis = typeof global &
  Window & {
    __navigationFocusTrace?: string[];
    __zendioB07OrderedAutosaveProbe?: OrderedAutosaveProbe;
    __zendioOptionsMutationTrace?: OptionsMutationTrace[];
    __zendioRetryNativeProbe?: RetryNativeProbe;
    __zendioSawConnectedRunningDiagnosis?: boolean;
    __zendioUsageResetTrace?: UsageResetTrace[];
  };
declare const globalThis: B07GlobalThis;

type StoredCaptureContextResult = {
  options?: {
    fragmentClipper?: { captureContext?: boolean };
    vaultRouter?: object;
  };
};

type RuntimeMessageCallback = (response: MessagePayload) => void;
type RuntimeSendMessageArgs = [
  message: MessagePayload,
  optionsOrCallback?: chrome.runtime.MessageOptions | RuntimeMessageCallback,
  callback?: RuntimeMessageCallback
];
type RuntimeSendMessage = <Arguments extends RuntimeSendMessageArgs>(
  ...args: Arguments
) => object | void;

async function readOrderedAutosaveProbe(
  page: Page
): Promise<Omit<OrderedAutosaveProbe, 'release'>> {
  return page.evaluate(() => {
    const probe = globalThis.__zendioB07OrderedAutosaveProbe;
    if (!probe) throw new Error('Ordered autosave probe was not installed.');
    return { held: probe.held, released: probe.released, values: [...probe.values] };
  });
}

async function readDurableCaptureContext(page: Page): Promise<boolean | undefined> {
  return page.evaluate(async () => {
    const result = await chrome.storage.sync.get<StoredCaptureContextResult>('options');
    const options = result.options;
    if (typeof options !== 'object' || options === null || Array.isArray(options)) return undefined;
    const fragmentClipper = options.fragmentClipper;
    if (
      typeof fragmentClipper !== 'object' ||
      fragmentClipper === null ||
      Array.isArray(fragmentClipper)
    ) {
      return undefined;
    }
    const captureContext = fragmentClipper.captureContext;
    return typeof captureContext === 'boolean' ? captureContext : undefined;
  });
}

function optionsUrl(): string {
  const port = process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? '4181';
  return `http://127.0.0.1:${port}/options/index.html`;
}

function sectionInvalidationChunkUrl(): string {
  const directory = join(extensionPath, 'chunks');
  const file = readdirSync(directory)
    .filter((name) => /^sectionInvalidation-[A-Z0-9]+\.js$/u.test(name))
    .sort(
      (left, right) =>
        statSync(join(directory, left)).mtimeMs - statSync(join(directory, right)).mtimeMs
    )
    .at(-1);
  if (!file) throw new Error('Missing built sectionInvalidation chunk.');
  return `/chunks/${file}`;
}

function mobileNavigationChunkName(): string {
  const directory = join(extensionPath, 'chunks');
  const file = readdirSync(directory).find((name) =>
    /^productionStitchMobileNavigation-[A-Z0-9]+\.js$/u.test(name)
  );
  if (!file) throw new Error('Missing built productionStitchMobileNavigation chunk.');
  return file;
}

async function installHeldMobileNavigationRoute(context: BrowserContext) {
  const requested = { url: '' };
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await context.route('**/chunks/productionStitchMobileNavigation-*.js', async (route) => {
    requested.url = route.request().url();
    await gate;
    await route.continue();
  });
  return { release, requested };
}

async function installRejectedMobileNavigationRoute(context: BrowserContext) {
  const requested = { url: '' };
  await context.route('**/chunks/productionStitchMobileNavigation-*.js', async (route) => {
    requested.url = route.request().url();
    await route.abort('failed');
  });
  return requested;
}

async function assertMobileFallbackLayout(page: Page, width: 390 | 320): Promise<void> {
  await page.setViewportSize({ width, height: 844 });
  await expect(page.locator('#optionsShellRoot')).toHaveAttribute(
    'data-mobile-navigation-fallback',
    ''
  );
  await expect(page.locator('.sidebar')).toHaveCount(1);
  await expect(page.locator('[data-mobile-navigation-trigger]')).toHaveCount(0);
  await expect(page.locator('[data-mobile-navigation-backdrop]')).toHaveCount(0);
  await expect(page.locator('.sidebar')).not.toHaveAttribute('inert', '');
  await expect(page.locator('.sidebar')).not.toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('.sidebar')).not.toHaveClass(/is-mobile-open/u);

  const layout = await page.evaluate(() => {
    const app = document.querySelector<HTMLElement>('.app');
    const sidebar = document.querySelector<HTMLElement>('.sidebar');
    const main = document.querySelector<HTMLElement>('.main');
    const shell = document.querySelector<HTMLElement>('.shell');
    if (!app || !sidebar || !main || !shell) throw new Error('Missing fallback layout owner.');
    const appStyle = getComputedStyle(app);
    const sidebarStyle = getComputedStyle(sidebar);
    const mainStyle = getComputedStyle(main);
    const sidebarRect = sidebar.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();
    const sidebarScrollBefore = sidebar.scrollTop;
    const mainScrollBefore = main.scrollTop;
    const sidebarMax = Math.max(sidebar.scrollHeight - sidebar.clientHeight, 0);
    const mainMax = Math.max(main.scrollHeight - main.clientHeight, 0);
    sidebar.scrollTop = sidebarScrollBefore > 0 ? 0 : Math.min(80, sidebarMax);
    main.scrollTop = mainScrollBefore > 0 ? 0 : Math.min(80, mainMax);
    return {
      appDisplay: appStyle.display,
      appOverflow: appStyle.overflow,
      bodyInlineOverflow: document.body.style.overflow,
      documentFits: document.documentElement.scrollWidth <= window.innerWidth,
      gridRows: appStyle.gridTemplateRows,
      mainInlineOverflow: main.style.overflow,
      mainMoved: main.scrollTop !== mainScrollBefore,
      mainOverflowY: mainStyle.overflowY,
      mainRect: { bottom: mainRect.bottom, height: mainRect.height, top: mainRect.top },
      nonOverlapping: sidebarRect.bottom <= mainRect.top + 1,
      shellHeight: shell.getBoundingClientRect().height,
      sidebarMoved: sidebar.scrollTop !== sidebarScrollBefore,
      sidebarOverflowY: sidebarStyle.overflowY,
      sidebarPosition: sidebarStyle.position,
      sidebarRect: { bottom: sidebarRect.bottom, height: sidebarRect.height, top: sidebarRect.top },
      sidebarTransform: sidebarStyle.transform,
      sidebarVisibility: sidebarStyle.visibility
    };
  });

  expect(layout).toMatchObject({
    appDisplay: 'grid',
    appOverflow: 'hidden',
    bodyInlineOverflow: '',
    documentFits: true,
    mainInlineOverflow: '',
    mainMoved: true,
    mainOverflowY: 'auto',
    nonOverlapping: true,
    sidebarMoved: true,
    sidebarOverflowY: 'auto',
    sidebarPosition: 'static',
    sidebarTransform: 'none',
    sidebarVisibility: 'visible'
  });
  const gridRows = layout.gridRows.split(' ').map((value) => Number.parseFloat(value));
  expect(gridRows[0]).toBeGreaterThan(0);
  expect(gridRows[1]).toBeGreaterThan(0);
  expect(gridRows.slice(2).every((value) => value <= 1)).toBe(true);
  expect(layout.sidebarRect.top).toBeGreaterThanOrEqual(0);
  expect(layout.sidebarRect.bottom).toBeLessThanOrEqual(844);
  expect(layout.mainRect.top).toBeGreaterThanOrEqual(0);
  expect(layout.mainRect.bottom).toBeLessThanOrEqual(845);
  expect(layout.sidebarRect.height).toBeGreaterThan(0);
  expect(layout.mainRect.height).toBeGreaterThan(0);
  expect(layout.shellHeight).toBeGreaterThan(0);
}

async function expectFocusedInsideMain(page: Page, panelId: string): Promise<void> {
  const result = await page.evaluate((targetPanelId) => {
    const main = document.querySelector<HTMLElement>('.main');
    const heading = document.querySelector<HTMLElement>(`[data-panel-id="${targetPanelId}"] h1`);
    if (!main || !heading) throw new Error(`Missing panel heading: ${targetPanelId}`);
    const mainRect = main.getBoundingClientRect();
    const headingRect = heading.getBoundingClientRect();
    return {
      focused: document.activeElement === heading,
      visible:
        headingRect.top >= mainRect.top - 1 &&
        headingRect.bottom <= mainRect.bottom + 1 &&
        headingRect.bottom > mainRect.top
    };
  }, panelId);
  expect(result).toEqual({ focused: true, visible: true });
}

async function settleBrowserFrame(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

async function exerciseFallbackDestinations(page: Page, context: BrowserContext): Promise<void> {
  const panels = [
    'overview',
    'storage',
    'capture-sources',
    'capture-behavior',
    'output',
    'maintenance'
  ];
  for (const [index, panelId] of panels.entries()) {
    const target = page.locator(`[data-nav-panel="${panelId}"]`);
    if (index % 2 === 0) await target.click();
    else {
      await target.focus();
      await target.evaluate((button) => {
        button.dataset.keyboardTrace = '';
        for (const type of ['keydown', 'keyup', 'click']) {
          button.addEventListener(
            type,
            (event) => {
              const keyboard = event instanceof KeyboardEvent ? `:${event.key}` : '';
              button.dataset.keyboardTrace += `${type}${keyboard}|`;
            },
            { once: true }
          );
        }
      });
      await target.press('Enter');
      expect(await target.getAttribute('data-keyboard-trace')).toContain('click|');
    }
    await expect(target).toHaveAttribute('aria-current', 'page');
    await expectFocusedInsideMain(page, panelId);
    await settleBrowserFrame(page);
  }

  for (const [index, resourceId] of ['support', 'suggestions', 'contact', 'changelog'].entries()) {
    const target = page.locator(`[data-footer-panel="${resourceId}"]`);
    if (index % 2 === 0) await target.click();
    else {
      await target.focus();
      await target.press('Space');
    }
    const dialog = page.locator('.resource-modal-overlay > .resource-modal[role="dialog"]');
    await expect(dialog).toBeFocused();
    await page.locator('.resource-modal-overlay').click({ position: { x: 4, y: 4 } });
    await expect(page.locator('[data-footer-panel][aria-current="page"]')).toHaveCount(0);
    await settleBrowserFrame(page);
    const focusAfterClose = await page.evaluate(() => {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      return {
        activePanel: active?.dataset.navPanel ?? null,
        className: active?.className ?? null,
        tagName: active?.tagName ?? null
      };
    });
    expect(focusAfterClose).toEqual({
      activePanel: await page
        .locator('[data-nav-panel][aria-current="page"]')
        .getAttribute('data-nav-panel'),
      className: expect.stringContaining('is-active'),
      tagName: 'BUTTON'
    });
  }

  const opened = context.waitForEvent('page');
  const onboarding = page.locator('[data-footer-panel="onboarding"]');
  await onboarding.focus();
  await page.keyboard.press('Enter');
  const onboardingPage = await opened;
  await onboardingPage.waitForLoadState('domcontentloaded');
  expect(onboardingPage.url()).toContain('/onboarding/index.html');
  await onboardingPage.close();
  await expect(onboarding).not.toHaveAttribute('aria-current', 'page');
}

async function armMaintenanceRunningProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    globalThis.__zendioSawConnectedRunningDiagnosis = false;
    const observer = new MutationObserver(() => {
      const button = document.querySelector<HTMLButtonElement>(
        '[data-panel-id="maintenance"] [data-action-id="maintenance:diagnose"]'
      );
      if (
        button?.isConnected &&
        button.disabled &&
        document
          .querySelector('[data-panel-id="maintenance"]')
          ?.textContent?.includes('Running diagnostics')
      ) {
        globalThis.__zendioSawConnectedRunningDiagnosis = true;
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
}

async function sawConnectedRunningDiagnosis(page: Page): Promise<boolean> {
  return page.evaluate(() => globalThis.__zendioSawConnectedRunningDiagnosis === true);
}

async function installFinalUiMessageTrace(context: BrowserContext): Promise<void> {
  await context.addInitScript(() => {
    const runtime = globalThis.chrome?.runtime;
    if (!runtime || typeof runtime.sendMessage !== 'function') return;

    const trace: UsageResetTrace[] = [];
    const optionsTrace: OptionsMutationTrace[] = [];
    const originalSendMessage: RuntimeSendMessage = runtime.sendMessage.bind(runtime);
    const tracedSendMessage = (...args: RuntimeSendMessageArgs) => {
      const message = args[0];
      const callbackIndex = args.length - 1;
      const callback = args[callbackIndex];
      if (
        typeof message === 'object' &&
        message !== null &&
        !Array.isArray(message) &&
        message.type === 'ZENDIO_USAGE_STATS' &&
        message.operation === 'reset' &&
        typeof message.requestId === 'string' &&
        typeof callback === 'function'
      ) {
        const request: UsageResetTrace['request'] = {
          type: 'ZENDIO_USAGE_STATS',
          requestId: message.requestId,
          operation: 'reset'
        };
        const tracedCallback: RuntimeMessageCallback = (response) => {
          callback(response);
          setTimeout(() => trace.push({ request, response: structuredClone(response) }), 0);
        };
        args[callbackIndex] = tracedCallback;
      } else if (
        typeof message === 'object' &&
        message !== null &&
        !Array.isArray(message) &&
        message.type === 'ZENDIO_OPTIONS_MUTATION' &&
        typeof message.requestId === 'string' &&
        typeof callback === 'function'
      ) {
        const request: OptionsMutationTrace['request'] = {
          type: 'ZENDIO_OPTIONS_MUTATION',
          requestId: message.requestId,
          command: structuredClone(message.command)
        };
        const tracedCallback: RuntimeMessageCallback = (response) => {
          callback(response);
          setTimeout(() => optionsTrace.push({ request, response: structuredClone(response) }), 0);
        };
        args[callbackIndex] = tracedCallback;
      }
      return Reflect.apply(originalSendMessage, runtime, args);
    };
    Object.defineProperty(runtime, 'sendMessage', {
      configurable: true,
      value: tracedSendMessage
    });
    Object.defineProperty(globalThis, '__zendioUsageResetTrace', {
      configurable: true,
      value: trace
    });
    Object.defineProperty(globalThis, '__zendioOptionsMutationTrace', {
      configurable: true,
      value: optionsTrace
    });
  });
}

test('Options invalidates owned sections while preserving unrelated browser state', async ({
  page
}) => {
  expect(SECTION_INVALIDATION_SCOPES).toHaveLength(11);
  expect(ROUTING_TEMPLATE_ROWS).toHaveLength(20);
  expect(new Set(ROUTING_TEMPLATE_ROWS.map(([action]) => action)).size).toBe(20);

  await page.addInitScript(() => {
    const addDescriptor = Object.getOwnPropertyDescriptor(
      EventTarget.prototype,
      'addEventListener'
    ) as { value?: typeof EventTarget.prototype.addEventListener } | undefined;
    const originalAdd = addDescriptor?.value;
    if (typeof originalAdd !== 'function') {
      throw new Error('EventTarget.addEventListener descriptor missing');
    }
    const removeDescriptor = Object.getOwnPropertyDescriptor(
      EventTarget.prototype,
      'removeEventListener'
    ) as { value?: typeof EventTarget.prototype.removeEventListener } | undefined;
    const originalRemove = removeDescriptor?.value;
    if (typeof originalRemove !== 'function') {
      throw new Error('EventTarget.removeEventListener descriptor missing');
    }
    const counts = { added: 0, removed: 0 };
    Object.defineProperty(window, '__u04bListenerCounts', { value: counts });
    EventTarget.prototype.addEventListener = function (
      ...args: Parameters<EventTarget['addEventListener']>
    ) {
      counts.added += 1;
      return Reflect.apply(originalAdd, this, args);
    };
    EventTarget.prototype.removeEventListener = function (
      ...args: Parameters<EventTarget['removeEventListener']>
    ) {
      counts.removed += 1;
      return Reflect.apply(originalRemove, this, args);
    };
  });

  await page.goto(optionsUrl());
  await expect(page.locator('[data-panel-id]')).toHaveCount(6);
  await expect(page.locator('.stitch-yaml-config-widget')).toBeVisible();

  await page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('.main');
    const output = document.querySelector<HTMLElement>('[data-panel-id="output"]');
    const input = Array.from(output?.querySelectorAll<HTMLInputElement>('input') ?? []).find(
      (candidate) => candidate.value.length >= 4 && candidate.type === 'text'
    );
    if (!main || !output || !input) throw new Error('Missing Options incremental fixture.');
    input.focus();
    input.setSelectionRange(1, Math.min(4, input.value.length));
    main.scrollTop = 420;
    const roots: Record<string, HTMLElement> = {};
    for (const root of document.querySelectorAll<HTMLElement>('[data-panel-id]')) {
      const panelId = root.dataset.panelId;
      if (!panelId) throw new Error('Options panel is missing its owned panel id.');
      roots[panelId] = root;
    }
    Object.defineProperty(window, '__u04bIdentity', {
      configurable: true,
      value: {
        main,
        input,
        output,
        yaml: document.querySelector('.stitch-yaml-config-widget'),
        roots
      }
    });
    Array.from(document.querySelectorAll('button'))
      .find((button) => button.textContent?.includes('Add Vault'))
      ?.click();
  });

  const storageResult = await page.evaluate(() => {
    const identity = (
      window as typeof window & {
        __u04bIdentity: {
          input: HTMLInputElement;
          main: HTMLElement;
          output: HTMLElement;
          roots: Record<string, HTMLElement>;
          yaml: Element | null;
        };
      }
    ).__u04bIdentity;
    return {
      focus: document.activeElement === identity.input,
      main: document.querySelector('.main') === identity.main,
      output: document.querySelector('[data-panel-id="output"]') === identity.output,
      selection: [identity.input.selectionStart, identity.input.selectionEnd],
      storage: document.querySelector('[data-panel-id="storage"]') !== identity.roots.storage,
      unrelated: ['overview', 'capture-sources', 'capture-behavior', 'output', 'maintenance'].every(
        (id) => document.querySelector(`[data-panel-id="${id}"]`) === identity.roots[id]
      ),
      yaml: document.querySelector('.stitch-yaml-config-widget') === identity.yaml,
      scrollTop: identity.main.scrollTop
    };
  });
  expect(storageResult).toEqual({
    focus: true,
    main: true,
    output: true,
    selection: [1, 4],
    storage: true,
    unrelated: true,
    yaml: true,
    scrollTop: 420
  });

  const themeResult = await page.evaluate(() => {
    const counts = (
      window as typeof window & { __u04bListenerCounts: { added: number; removed: number } }
    ).__u04bListenerCounts;
    const before = { ...counts };
    const roots = Array.from(document.querySelectorAll<HTMLElement>('[data-panel-id]'));
    const dark = document.querySelector<HTMLButtonElement>(
      '[data-panel-id="overview"] .chips button[data-value="dark"]'
    );
    const light = document.querySelector<HTMLButtonElement>(
      '[data-panel-id="overview"] .chips button[data-value="light"]'
    );
    if (!dark || !light) throw new Error('Missing theme controls.');
    for (let index = 0; index < 100; index += 1) (index % 2 ? dark : light).click();
    return {
      listenersFlat: counts.added === before.added && counts.removed === before.removed,
      rootsStable: roots.every((root) => document.getElementById(root.id) === root)
    };
  });
  expect(themeResult).toEqual({ listenersFlat: true, rootsStable: true });

  const documentSelection = await page.evaluate(() => {
    const storage = document.querySelector<HTMLElement>('[data-panel-id="storage"]');
    const heading = Array.from(storage?.querySelectorAll<HTMLElement>('h2, h3') ?? []).find(
      (candidate) => candidate.textContent?.trim() === 'Vault List'
    );
    const text = heading?.firstChild;
    const addVault = Array.from(storage?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
      (button) => button.textContent?.trim() === 'Add Vault'
    );
    if (!text || !addVault) throw new Error('Missing document selection fixture.');
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, text.textContent?.length ?? 0);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    addVault.click();
    return {
      activeInput: document.activeElement instanceof HTMLInputElement,
      selection: selection?.toString()
    };
  });
  expect(documentSelection).toEqual({ activeInput: false, selection: 'Vault List' });

  const modalResult = await page.evaluate(() => {
    const privacy = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Privacy Policy'
    );
    privacy?.click();
    const modal = document.querySelector('.resource-modal-overlay');
    const dark = document.querySelector<HTMLButtonElement>(
      '[data-panel-id="overview"] .chips button[data-value="dark"]'
    );
    const addVault = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Add Vault'
    );
    dark?.click();
    addVault?.click();
    return {
      modalPreserved: document.querySelector('.resource-modal-overlay') === modal,
      open: Boolean(document.querySelector('[role="dialog"]'))
    };
  });
  expect(modalResult).toEqual({ modalPreserved: true, open: true });
  await page.locator('.resource-modal-overlay').click({ position: { x: 4, y: 4 } });
  await expect(page.locator('[role="dialog"]')).toHaveCount(0);

  const yamlResult = await page.evaluate(() => {
    const widget = document.querySelector('.stitch-yaml-config-widget');
    const toggle = document.querySelector<HTMLInputElement>(
      '.stitch-yaml-config-widget input.stitch-yaml-toggle:not(:disabled)'
    );
    const light = document.querySelector<HTMLButtonElement>(
      '[data-panel-id="overview"] .chips button[data-value="light"]'
    );
    const addVault = Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(
      (button) => button.textContent?.trim() === 'Add Vault'
    );
    if (!widget || !toggle || !light || !addVault)
      throw new Error('Missing YAML lifecycle fixture.');
    toggle.click();
    light.click();
    addVault.click();
    const unrelatedPreserved = document.querySelector('.stitch-yaml-config-widget') === widget;
    document.querySelector<HTMLButtonElement>('[data-action-id="domain:add"]')?.click();
    return {
      outputReplaced: document.querySelector('.stitch-yaml-config-widget') !== widget,
      unrelatedPreserved
    };
  });
  expect(yamlResult).toEqual({ outputReplaced: true, unrelatedPreserved: true });
});

test('built invalidation owner dispatches the finite scope and lifecycle matrix', async ({
  page
}) => {
  await page.goto(optionsUrl());
  const result = await page.evaluate(
    async ({ chunkUrl, rows, scopes }) => {
      const moduleValue = (await import(chunkUrl)) as object;
      const isSectionInvalidationModule = (
        value: object
      ): value is typeof import('../../src/ui/stitch-runtime/render/sectionInvalidation') =>
        'createSectionInvalidationOwner' in value &&
        typeof value.createSectionInvalidationOwner === 'function' &&
        'captureSectionDomSnapshot' in value &&
        typeof value.captureSectionDomSnapshot === 'function' &&
        'restoreSectionDomSnapshot' in value &&
        typeof value.restoreSectionDomSnapshot === 'function';
      if (!isSectionInvalidationModule(moduleValue)) {
        throw new Error('Built section invalidation module is missing required exports.');
      }
      const module = moduleValue;
      const sandbox = document.createElement('div');
      sandbox.innerHTML = `<main class="main" style="height:20px;overflow:auto"><section data-fixture="controls"><input data-control="text" value="abcdef"><input data-control="checkbox" type="checkbox"><input data-control="radio" type="radio"><input data-control="number" type="number" value="7"><p data-selection>selection</p></section>${scopes
        .map(
          (scope) =>
            `<section data-owned="${scope}" data-version="0">${
              scope === 'output' ? '<div data-widget="yaml"></div>' : scope
            }</section>`
        )
        .join('')}<div style="height:200px"></div></main>`;
      document.body.append(sandbox);
      const calls: string[] = [];
      let reenterStorage = false;
      function invalidateReentrantScopes(): void {
        owner.invalidate(['maintenance', 'output']);
      }
      const replaceOwned = (scope: string) => {
        const current = sandbox.querySelector<HTMLElement>(`[data-owned="${scope}"]`);
        if (!current) return;
        const next = current.cloneNode(true);
        if (!(next instanceof HTMLElement)) throw new Error('Owned root clone must be an element.');
        next.dataset.version = String(Number(current.dataset.version ?? 0) + 1);
        current.replaceWith(next);
      };
      const handlers = Object.fromEntries(
        scopes.map((scope) => [
          scope,
          () => {
            calls.push(scope);
            replaceOwned(scope);
            if (scope === 'storage' && reenterStorage) {
              reenterStorage = false;
              invalidateReentrantScopes();
            }
          }
        ])
      );
      const owner: ReturnType<typeof module.createSectionInvalidationOwner> =
        module.createSectionInvalidationOwner({
          handlers,
          capture: () => module.captureSectionDomSnapshot(sandbox),
          restore: (snapshot) => module.restoreSectionDomSnapshot(sandbox, snapshot)
        });

      const widget = sandbox.querySelector('[data-widget="yaml"]');
      owner.invalidate('storage');
      const widgetAfterStorage = sandbox.querySelector('[data-widget="yaml"]') === widget;
      owner.invalidate('output');
      const widgetAfterOutput = sandbox.querySelector('[data-widget="yaml"]') !== widget;
      calls.length = 0;

      scopes.forEach((scope) => owner.invalidate(scope));
      const finiteScopes = [...calls];
      calls.length = 0;
      rows.forEach(([, scope]) => owner.invalidate(scope));
      const rowScopes = [...calls];
      calls.length = 0;

      const replaceControls = () => {
        const current = sandbox.querySelector('[data-fixture="controls"]');
        if (!current) throw new Error('Missing controls fixture.');
        current.replaceWith(current.cloneNode(true));
      };

      const textInput = sandbox.querySelector<HTMLInputElement>('[data-control="text"]');
      if (!textInput) throw new Error('Missing text input fixture.');
      const main = sandbox.querySelector<HTMLElement>('.main');
      if (!main) throw new Error('Missing main fixture.');
      textInput.focus();
      textInput.setSelectionRange(2, 5);
      main.scrollTop = 77;
      const expectedScrollTop = main.scrollTop;
      const textSnapshot = module.captureSectionDomSnapshot(sandbox);
      replaceControls();
      module.restoreSectionDomSnapshot(sandbox, textSnapshot);
      const nextText = sandbox.querySelector<HTMLInputElement>('[data-control="text"]');
      const textControl = {
        focus: document.activeElement === nextText,
        selection: [nextText?.selectionStart, nextText?.selectionEnd],
        expectedScrollTop,
        scrollTop: main.scrollTop
      };

      const nonTextControls: Record<string, boolean> = {};
      for (const type of ['checkbox', 'radio', 'number']) {
        const control = sandbox.querySelector<HTMLInputElement>(`[data-control="${type}"]`);
        control?.focus();
        const snapshot = module.captureSectionDomSnapshot(sandbox);
        replaceControls();
        module.restoreSectionDomSnapshot(sandbox, snapshot);
        nonTextControls[type] =
          document.activeElement ===
          sandbox.querySelector<HTMLInputElement>(`[data-control="${type}"]`);
      }

      if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
      const selectedText = sandbox.querySelector('[data-selection]')?.firstChild;
      if (!selectedText) throw new Error('Missing document selection fixture.');
      const range = document.createRange();
      range.setStart(selectedText, 1);
      range.setEnd(selectedText, 5);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      const selectionSnapshot = module.captureSectionDomSnapshot(sandbox);
      replaceControls();
      selection?.removeAllRanges();
      module.restoreSectionDomSnapshot(sandbox, selectionSnapshot);
      const documentSelection = selection?.toString();

      calls.length = 0;
      reenterStorage = true;
      owner.invalidate('storage');
      const crossKey = [...calls];

      calls.length = 0;
      let lifecycleState = 'stable';
      let failOnce = true;
      const originalMaintenance = handlers.maintenance;
      handlers.maintenance = () => {
        calls.push('maintenance');
        lifecycleState = 'optimistic';
        if (failOnce) {
          failOnce = false;
          throw new Error('expected failure');
        }
        lifecycleState = 'committed';
      };
      try {
        owner.invalidate('maintenance');
      } catch {
        lifecycleState = 'stable';
      }
      owner.invalidate('maintenance');
      const failureRetry = { calls: [...calls], lifecycleState };
      handlers.maintenance = originalMaintenance;

      let modalOpen = true;
      handlers['resource-modal'] = () => {
        calls.push('resource-modal');
        sandbox.dataset.modal = modalOpen ? 'open' : 'closed';
      };
      owner.invalidate('resource-modal');
      modalOpen = false;
      owner.invalidate('resource-modal');
      const dismissed = sandbox.dataset.modal;
      let deletionPending = true;
      handlers.storage = () => {
        calls.push('storage');
        sandbox.dataset.deletion = deletionPending ? 'pending' : 'cancelled';
      };
      owner.invalidate('storage');
      deletionPending = false;
      owner.invalidate('storage');
      const cancelled = sandbox.dataset.deletion;

      let generation = 0;
      let supersededState = '';
      const deferred = () => {
        let resolve = (): void => undefined;
        const promise = new Promise<void>((done) => (resolve = () => done()));
        return { promise, resolve };
      };
      const first = deferred();
      const second = deferred();
      const complete = async (value: string, promise: Promise<void>) => {
        const current = ++generation;
        await promise;
        if (current === generation) {
          supersededState = value;
          owner.invalidate('storage');
        }
      };
      const firstRun = complete('first', first.promise);
      const secondRun = complete('second', second.promise);
      second.resolve();
      await secondRun;
      first.resolve();
      await firstRun;

      calls.length = 0;
      for (let index = 0; index < 100; index += 1) owner.invalidate('storage');
      const repeated = calls.length;
      const beforeDispose = calls.length;
      owner.dispose();
      queueMicrotask(() => owner.invalidate(['storage', 'maintenance']));
      await Promise.resolve();

      return {
        cancelled,
        crossKey,
        dismissed,
        documentSelection,
        failureRetry,
        finiteScopes,
        lateNoop: calls.length === beforeDispose,
        nonTextControls,
        repeated,
        rowScopes,
        supersededState,
        textControl,
        widgetAfterOutput,
        widgetAfterStorage
      };
    },
    {
      chunkUrl: sectionInvalidationChunkUrl(),
      rows: ROUTING_TEMPLATE_ROWS,
      scopes: SECTION_INVALIDATION_SCOPES
    }
  );

  expect(result.finiteScopes).toEqual(SECTION_INVALIDATION_SCOPES);
  expect(result.rowScopes).toEqual(ROUTING_TEMPLATE_ROWS.map(([, scope]) => scope));
  expect(result.widgetAfterStorage).toBe(true);
  expect(result.widgetAfterOutput).toBe(true);
  expect(result.textControl.focus).toBe(true);
  expect(result.textControl.selection).toEqual([2, 5]);
  expect(result.textControl.scrollTop).toBe(result.textControl.expectedScrollTop);
  expect(result.textControl.scrollTop).toBeGreaterThan(0);
  expect(result.nonTextControls).toEqual({ checkbox: true, radio: true, number: true });
  expect(result.documentSelection).toBe('elec');
  expect(result.crossKey).toEqual(['storage', 'maintenance', 'output']);
  expect(result.failureRetry).toEqual({
    calls: ['maintenance', 'maintenance'],
    lifecycleState: 'committed'
  });
  expect(result.dismissed).toBe('closed');
  expect(result.cancelled).toBe('cancelled');
  expect(result.supersededState).toBe('second');
  expect(result.repeated).toBe(100);
  expect(result.lateNoop).toBe(true);
});

test('lazy invalidation rejection recovers without an unhandled page error', async ({ page }) => {
  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.route('**/chunks/sectionInvalidation-*.js', (route) => route.abort('failed'));
  await page.goto(optionsUrl());
  await expect(page.locator('[data-panel-id]')).toHaveCount(6);
  await page.waitForTimeout(50);

  const recovery = await page.evaluate(() => {
    const main = document.querySelector('.main');
    const storage = document.querySelector('[data-panel-id="storage"]');
    const addVault = Array.from(storage?.querySelectorAll<HTMLButtonElement>('button') ?? []).find(
      (button) => button.textContent?.trim() === 'Add Vault'
    );
    storage?.remove();
    addVault?.click();
    return {
      mainReplaced: document.querySelector('.main') !== main,
      panelCount: document.querySelectorAll('[data-panel-id]').length,
      storageRecovered: Boolean(document.querySelector('[data-panel-id="storage"]'))
    };
  });

  expect(recovery).toEqual({ mainReplaced: true, panelCount: 6, storageRecovered: true });
  expect(pageErrors).toEqual([]);
});

test('Options serializes a durable reversal behind the held first transport', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'zendio-b07-options-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const background =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id.');

    await background.evaluate(() =>
      chrome.storage.sync.set({ options: { fragmentClipper: { captureContext: false } } })
    );
    await context.addInitScript(() => {
      const runtime = globalThis.chrome?.runtime;
      if (!runtime || typeof runtime.sendMessage !== 'function') return;

      const originalSendMessage: RuntimeSendMessage = runtime.sendMessage.bind(runtime);
      let pendingArgs: RuntimeSendMessageArgs | null = null;
      const readCaptureContextPatch = (message: MessagePayload): boolean | undefined => {
        if (typeof message !== 'object' || message === null || Array.isArray(message)) {
          return undefined;
        }
        const record = message;
        if (record.type !== 'ZENDIO_OPTIONS_MUTATION') return undefined;
        const command = record.command;
        if (typeof command !== 'object' || command === null || Array.isArray(command)) {
          return undefined;
        }
        const patches = command.patches;
        if (!Array.isArray(patches)) return undefined;
        for (const patch of patches) {
          if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) continue;
          const patchRecord = patch;
          const patchPath = patchRecord.path;
          if (
            Array.isArray(patchPath) &&
            patchPath.length === 2 &&
            patchPath[0] === 'fragmentClipper' &&
            patchPath[1] === 'captureContext' &&
            typeof patchRecord.value === 'boolean'
          ) {
            return patchRecord.value;
          }
        }
        return undefined;
      };
      const probe: OrderedAutosaveProbe = {
        held: false,
        released: false,
        values: [],
        release() {
          if (!pendingArgs) throw new Error('No ordered autosave mutation is pending.');
          const args = pendingArgs;
          pendingArgs = null;
          probe.released = true;
          Reflect.apply(originalSendMessage, runtime, args);
        }
      };
      const gatedSendMessage = (...args: RuntimeSendMessageArgs) => {
        const captureContext = readCaptureContextPatch(args[0]);
        if (captureContext !== undefined) probe.values.push(captureContext);
        const callback = args.at(-1);
        if (captureContext === true && !probe.held && typeof callback === 'function') {
          probe.held = true;
          pendingArgs = args;
          return undefined;
        }
        return Reflect.apply(originalSendMessage, runtime, args);
      };
      Object.defineProperty(runtime, 'sendMessage', {
        configurable: true,
        value: gatedSendMessage
      });
      Object.defineProperty(globalThis, '__zendioB07OrderedAutosaveProbe', {
        configurable: true,
        value: probe
      });
    });

    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options/index.html`, {
      waitUntil: 'domcontentloaded'
    });

    const captureBehaviorNav = optionsPage.locator('[data-nav-panel="capture-behavior"]');
    await captureBehaviorNav.click();
    await expect(captureBehaviorNav).toHaveClass(/is-active/u);
    const captureContextRow = optionsPage
      .locator('[data-panel-id="capture-behavior"] .row')
      .filter({ has: optionsPage.getByText('Capture Context', { exact: true }) });
    const captureContextSwitch = captureContextRow.locator('label.switch');
    const captureContextInput = captureContextSwitch.locator('input[type="checkbox"]');
    await expect(captureContextRow).toBeVisible();
    await expect(captureContextSwitch).toBeVisible();
    await expect(captureContextSwitch).toBeEnabled();
    await expect(captureContextInput).not.toBeChecked();

    await captureContextSwitch.click();
    await expect
      .poll(() => readOrderedAutosaveProbe(optionsPage))
      .toEqual({
        held: true,
        released: false,
        values: [true]
      });

    await captureContextSwitch.click();
    await expect(captureContextInput).not.toBeChecked();
    await optionsPage.waitForTimeout(500);
    await expect
      .poll(() => readOrderedAutosaveProbe(optionsPage))
      .toEqual({
        held: true,
        released: false,
        values: [true]
      });

    await optionsPage.evaluate(() => {
      const probe = globalThis.__zendioB07OrderedAutosaveProbe;
      if (!probe) throw new Error('Ordered autosave probe was not installed.');
      probe.release();
    });

    await expect
      .poll(() => readOrderedAutosaveProbe(optionsPage))
      .toEqual({
        held: true,
        released: true,
        values: [true, false]
      });
    await expect.poll(() => readDurableCaptureContext(optionsPage)).toBe(false);
    await expect(captureContextInput).not.toBeChecked();
  } finally {
    await context.close();
  }
});

test('Options hands pending edits off across immediate reload and close', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'zendio-b08-options-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const background =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id.');

    await background.evaluate(() =>
      chrome.storage.sync.set({ options: { fragmentClipper: { captureContext: false } } })
    );

    let optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options/index.html`, {
      waitUntil: 'domcontentloaded'
    });
    const captureBehaviorNav = optionsPage.locator('[data-nav-panel="capture-behavior"]');
    await captureBehaviorNav.click();
    await expect(captureBehaviorNav).toHaveClass(/is-active/u);
    const captureContextRow = optionsPage
      .locator('[data-panel-id="capture-behavior"] .row')
      .filter({ has: optionsPage.getByText('Capture Context', { exact: true }) });
    const captureContextSwitch = captureContextRow.locator('label.switch');
    const captureContextInput = captureContextSwitch.locator('input[type="checkbox"]');
    await expect(captureContextRow).toBeVisible();
    await expect(captureContextSwitch).toBeVisible();
    await expect(captureContextSwitch).toBeEnabled();
    await expect(captureContextInput).not.toBeChecked();

    // Reload immediately after the visible user interaction without polling storage or awaiting
    // the debounce. The page-exit handoff must synchronously start the durable mutation.
    await captureContextSwitch.click();
    await optionsPage.reload({ waitUntil: 'domcontentloaded' });

    const captureContextAfterReload = optionsPage
      .locator('[data-panel-id="capture-behavior"] .row')
      .filter({ has: optionsPage.getByText('Capture Context', { exact: true }) });
    const switchAfterReload = captureContextAfterReload.locator('label.switch');
    const inputAfterReload = switchAfterReload.locator('input[type="checkbox"]');
    await expect(captureContextAfterReload).toBeVisible();
    await expect(switchAfterReload).toBeVisible();
    await expect(inputAfterReload).toBeChecked();
    await expect.poll(() => readDurableCaptureContext(optionsPage)).toBe(true);

    // Exercise the close path with the reverse edit and verify it from a fresh Options page.
    await switchAfterReload.click();
    await optionsPage.close();
    optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options/index.html`, {
      waitUntil: 'domcontentloaded'
    });
    const freshCaptureBehaviorNav = optionsPage.locator('[data-nav-panel="capture-behavior"]');
    await freshCaptureBehaviorNav.click();
    await expect(freshCaptureBehaviorNav).toHaveClass(/is-active/u);
    const freshCaptureContextRow = optionsPage
      .locator('[data-panel-id="capture-behavior"] .row')
      .filter({ has: optionsPage.getByText('Capture Context', { exact: true }) });
    const freshCaptureContextSwitch = freshCaptureContextRow.locator('label.switch');
    const freshCaptureContextInput = freshCaptureContextSwitch.locator('input[type="checkbox"]');
    await expect(freshCaptureContextRow).toBeVisible();
    await expect(freshCaptureContextSwitch).toBeVisible();
    await expect(freshCaptureContextInput).not.toBeChecked();
    await expect.poll(() => readDurableCaptureContext(optionsPage)).toBe(false);
  } finally {
    await context.close();
  }
});

test('F05 exposes installed maintenance idle, running, success, failure, and rerun states', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'zendio-f05-maintenance-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const background =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id.');
    const optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options/index.html`, {
      waitUntil: 'domcontentloaded'
    });
    const maintenance = optionsPage.locator('[data-panel-id="maintenance"]');
    const diagnose = maintenance.locator('[data-action-id="maintenance:diagnose"]');

    await expect(maintenance).toContainText('Diagnostics have not run yet.');
    await expect(maintenance).not.toContainText('is healthy');
    await armMaintenanceRunningProbe(optionsPage);
    await diagnose.click();
    await expect.poll(() => sawConnectedRunningDiagnosis(optionsPage)).toBe(true);
    await expect(maintenance).toContainText('Diagnosis Results');
    await expect(diagnose).toBeEnabled();

    await optionsPage.evaluate(() => {
      const stringify = JSON.stringify;
      JSON.stringify = function (value, replacer, space) {
        if (
          space === 2 &&
          typeof value === 'object' &&
          value !== null &&
          'rest' in value &&
          'templates' in value
        ) {
          JSON.stringify = stringify;
          throw new Error('controlled installed diagnostics failure');
        }
        if (Array.isArray(replacer) || replacer === null || replacer === undefined) {
          return stringify(value, replacer, space);
        }
        return stringify(value, replacer, space);
      };
    });
    await armMaintenanceRunningProbe(optionsPage);
    await diagnose.click();
    await expect.poll(() => sawConnectedRunningDiagnosis(optionsPage)).toBe(true);
    await expect(maintenance).toContainText('Diagnostics failed');
    await expect(maintenance).not.toContainText('Diagnosis Results');

    await armMaintenanceRunningProbe(optionsPage);
    await diagnose.click();
    await expect.poll(() => sawConnectedRunningDiagnosis(optionsPage)).toBe(true);
    await expect(maintenance).toContainText('Diagnosis Results');
    await expect(diagnose).toBeEnabled();
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('settles final navigation, usage reset, and canonical autosave Retry', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'zendio-final-ui-findings-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    viewport: { width: 1440, height: 1000 },
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const background =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id.');
    await expect
      .poll(() =>
        background.evaluate(async () =>
          Boolean((await chrome.storage.local.get('usageStats')).usageStats)
        )
      )
      .toBe(true);
    await background.evaluate(() =>
      chrome.storage.local.set({
        usageStats: {
          aiChatSaves: 2,
          fragmentSaves: 3,
          articleSaves: 4,
          lastUpdatedISO: '2026-09-11T00:00:00.000Z',
          history: [{ date: '2026-09-11', aiChat: 2, fragment: 3, article: 4 }]
        }
      })
    );
    await background.evaluate(() => chrome.storage.sync.set({ language: 'en' }));
    await installFinalUiMessageTrace(context);

    let optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options/index.html`, {
      waitUntil: 'domcontentloaded'
    });
    const usageValues = optionsPage.locator('[data-panel-id="overview"] .stat-value');
    await expect.poll(() => usageValues.allTextContents()).toEqual(['9', '2', '3', '4']);
    const readLocaleState = async () =>
      optionsPage.evaluate(async () => ({
        documentLanguage: document.documentElement.lang,
        navigationLabel: document.querySelector('.sidebar nav')?.getAttribute('aria-label'),
        renderedHeading:
          document
            .querySelector<HTMLElement>('[data-panel-id="overview"] h1')
            ?.textContent?.trim() ?? null,
        selectedLanguage: document.querySelector<HTMLSelectElement>(
          '[data-panel-id="overview"] .interface-theme-grid select'
        )?.value,
        storedLanguage: (await chrome.storage.sync.get('language')).language
      }));
    await expect.poll(readLocaleState).toEqual({
      documentLanguage: 'en',
      navigationLabel: 'Settings',
      renderedHeading: 'Overview',
      selectedLanguage: 'en',
      storedLanguage: 'en'
    });
    await optionsPage.close();
    optionsPage = await context.newPage();
    await optionsPage.goto(`chrome-extension://${extensionId}/options/index.html`, {
      waitUntil: 'domcontentloaded'
    });
    await expect.poll(readLocaleState).toEqual({
      documentLanguage: 'en',
      navigationLabel: 'Settings',
      renderedHeading: 'Overview',
      selectedLanguage: 'en',
      storedLanguage: 'en'
    });
    const languageSelect = optionsPage.locator(
      '[data-panel-id="overview"] .interface-theme-grid select'
    );
    await languageSelect.selectOption('zh-CN');
    await expect.poll(readLocaleState).toEqual({
      documentLanguage: 'zh-CN',
      navigationLabel: '设置',
      renderedHeading: '概览',
      selectedLanguage: 'zh-CN',
      storedLanguage: 'zh-CN'
    });
    await languageSelect.selectOption('en');
    await expect.poll(readLocaleState).toEqual({
      documentLanguage: 'en',
      navigationLabel: 'Settings',
      renderedHeading: 'Overview',
      selectedLanguage: 'en',
      storedLanguage: 'en'
    });

    await optionsPage.locator('[data-nav-panel="maintenance"]').click();
    await expect
      .poll(() =>
        optionsPage.evaluate(() => {
          const main = document.querySelector<HTMLElement>('.main');
          if (!main) return false;
          return Math.abs(main.scrollHeight - main.clientHeight - main.scrollTop) <= 1;
        })
      )
      .toBe(true);
    await optionsPage.waitForTimeout(100);
    const navigation = await optionsPage.evaluate(() => {
      const main = document.querySelector<HTMLElement>('.main');
      const panel = document.querySelector<HTMLElement>('[data-panel-id="maintenance"]');
      if (!main || !panel) throw new Error('Missing Maintenance scroll geometry.');
      const mainRect = main.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const current = Array.from(
        document.querySelectorAll<HTMLElement>('[data-nav-panel][aria-current="page"]')
      );
      return {
        atBottom: Math.abs(main.scrollHeight - main.clientHeight - main.scrollTop) <= 1,
        currentCount: current.length,
        currentPanel: current[0]?.dataset.navPanel ?? null,
        panelVisible: panelRect.top < mainRect.bottom && panelRect.bottom > mainRect.top,
        scrollable: main.scrollHeight > main.clientHeight
      };
    });

    const overview = optionsPage.locator('[data-nav-panel="overview"]');
    await overview.click();
    await expect(overview).toHaveAttribute('aria-current', 'page');
    await optionsPage.locator('[data-action-id="overview:clearUsageData"]').click();
    await expect
      .poll(() => optionsPage.evaluate(() => globalThis.__zendioUsageResetTrace?.length ?? 0))
      .toBe(1);
    await optionsPage.waitForTimeout(250);
    const usage = await optionsPage.evaluate(async () => ({
      durable: (await chrome.storage.local.get('usageStats')).usageStats,
      rendered: Array.from(
        document.querySelectorAll<HTMLElement>('[data-panel-id="overview"] .stat-value')
      ).map((element) => element.textContent?.trim()),
      statusClass: document.getElementById('msg')?.className ?? '',
      trace: globalThis.__zendioUsageResetTrace?.[0] ?? null
    }));

    await background.evaluate(() => {
      const area = chrome.storage.sync;
      const originalSet: typeof area.set = area.set.bind(area);
      type SyncItems = Partial<Record<string, object | string | number | boolean | null>>;
      let pending: { items: SyncItems; callback?: () => void } | null = null;
      const probe: RetryNativeProbe = {
        calls: 0,
        failures: 0,
        held: false,
        releases: 0,
        release() {
          if (!pending) throw new Error('No Retry storage write is pending.');
          const current = pending;
          pending = null;
          probe.releases += 1;
          if (current.callback) originalSet(current.items, current.callback);
          else void originalSet(current.items);
        }
      };
      const wrapped = (items: SyncItems, callback?: () => void): void => {
        probe.calls += 1;
        if (probe.failures === 0) {
          probe.failures += 1;
          throw new Error('FINAL_UI_FINDINGS_OPTIONS_STORAGE_FAILURE');
        }
        if (!probe.held) {
          probe.held = true;
          pending = { items, ...(callback ? { callback } : {}) };
          return;
        }
        if (callback) originalSet(items, callback);
        else void originalSet(items);
      };
      Object.defineProperty(area, 'set', { configurable: true, value: wrapped });
      Object.defineProperty(globalThis, '__zendioRetryNativeProbe', {
        configurable: true,
        value: probe
      });
    });
    const captureNav = optionsPage.locator('[data-nav-panel="capture-behavior"]');
    await captureNav.click();
    await expect(captureNav).toHaveAttribute('aria-current', 'page');
    const captureRow = optionsPage
      .locator('[data-panel-id="capture-behavior"] .row')
      .filter({ has: optionsPage.getByText('Capture Context', { exact: true }) });
    const captureToggle = captureRow.locator('label.switch');
    const captureInput = captureToggle.locator('input[type="checkbox"]');
    await expect(captureInput).not.toBeChecked();
    await captureToggle.click();
    await expect(captureInput).toBeChecked();
    const autosaveAlert = optionsPage.locator('[data-message-lane="autosave"]');
    await expect(autosaveAlert).toBeVisible();
    const retryButton = autosaveAlert.locator('button.aobx-status-message__retry');
    await retryButton.click();
    await expect(retryButton).toBeDisabled();
    await expect(retryButton).toHaveAttribute('aria-busy', 'true');
    await retryButton.click({ force: true });
    await expect
      .poll(() =>
        background.evaluate(() => ({
          calls: globalThis.__zendioRetryNativeProbe?.calls ?? -1,
          held: globalThis.__zendioRetryNativeProbe?.held ?? false
        }))
      )
      .toEqual({ calls: 2, held: true });
    await background.evaluate(() => globalThis.__zendioRetryNativeProbe?.release());
    await expect
      .poll(() => optionsPage.evaluate(() => globalThis.__zendioOptionsMutationTrace?.length ?? 0))
      .toBe(2);
    await expect
      .poll(() =>
        background.evaluate(
          async () =>
            (await chrome.storage.sync.get<StoredCaptureContextResult>('options')).options
              ?.fragmentClipper?.captureContext
        )
      )
      .toBe(true);
    await expect(autosaveAlert).toBeHidden();
    await expect(autosaveAlert).toHaveText('');
    const retry = await optionsPage.evaluate(async () => {
      const traces = globalThis.__zendioOptionsMutationTrace ?? [];
      const successful = traces[1]?.response;
      let successSnapshotHasRootRules: boolean | null = null;
      if (
        typeof successful === 'object' &&
        successful !== null &&
        !Array.isArray(successful) &&
        typeof successful.result === 'object' &&
        successful.result !== null &&
        !Array.isArray(successful.result) &&
        typeof successful.result.snapshot === 'object' &&
        successful.result.snapshot !== null &&
        !Array.isArray(successful.result.snapshot) &&
        typeof successful.result.snapshot.vaultRouter === 'object' &&
        successful.result.snapshot.vaultRouter !== null &&
        !Array.isArray(successful.result.snapshot.vaultRouter)
      ) {
        successSnapshotHasRootRules = Object.prototype.hasOwnProperty.call(
          successful.result.snapshot.vaultRouter,
          'rules'
        );
      }
      return {
        durable: (await chrome.storage.sync.get<StoredCaptureContextResult>('options')).options,
        successSnapshotHasRootRules,
        traces
      };
    });
    const retryNative = await background.evaluate(() => ({
      calls: globalThis.__zendioRetryNativeProbe?.calls ?? -1,
      failures: globalThis.__zendioRetryNativeProbe?.failures ?? -1,
      releases: globalThis.__zendioRetryNativeProbe?.releases ?? -1
    }));
    expect(retry.traces[0]?.response).toEqual({
      type: 'ZENDIO_OPTIONS_MUTATION_RESPONSE',
      requestId: retry.traces[0]?.request.requestId,
      success: false,
      errorCode: 'OPTIONS_STORAGE_FAILURE'
    });
    expect(retry.traces[1]?.response).toMatchObject({
      type: 'ZENDIO_OPTIONS_MUTATION_RESPONSE',
      requestId: retry.traces[1]?.request.requestId,
      success: true,
      result: { didWrite: true }
    });
    expect(retry.successSnapshotHasRootRules).toBe(false);
    expect(retry.durable?.fragmentClipper?.captureContext).toBe(true);
    expect(retry.durable?.vaultRouter).not.toHaveProperty('rules');
    expect(retryNative.failures).toBe(1);
    expect(retryNative.releases).toBe(1);
    expect(retryNative.calls).toBeGreaterThanOrEqual(2);
    await expect(retryButton).toHaveCount(0);
    expect(navigation).toEqual({
      atBottom: true,
      currentCount: 1,
      currentPanel: 'maintenance',
      panelVisible: true,
      scrollable: true
    });
    expect(usage.trace?.request).toMatchObject({
      type: 'ZENDIO_USAGE_STATS',
      operation: 'reset',
      requestId: expect.any(String)
    });
    expect(usage.trace?.response).toEqual({
      type: 'ZENDIO_USAGE_STATS_RESPONSE',
      requestId: usage.trace?.request.requestId,
      success: true,
      stats: {
        aiChatSaves: 0,
        fragmentSaves: 0,
        articleSaves: 0,
        lastUpdatedISO: null,
        history: []
      }
    });
    expect(usage.durable).toEqual({
      aiChatSaves: 0,
      fragmentSaves: 0,
      articleSaves: 0,
      lastUpdatedISO: null,
      history: []
    });
    expect(usage.rendered).toEqual(['0', '0', '0', '0']);
    expect(usage.statusClass).not.toContain('error');
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('F06 discriminates installed fallback keyboard and rejected modal focus settlement', async () => {
  const pendingRoot = await mkdtemp(join(tmpdir(), 'zendio-f06-keyboard-discriminator-'));
  const pendingContext = await chromium.launchPersistentContext(pendingRoot, {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const held = await installHeldMobileNavigationRoute(pendingContext);
    const background =
      pendingContext.serviceWorkers()[0] ??
      (await pendingContext.waitForEvent('serviceworker', { timeout: 15_000 }));
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id.');
    const page = await pendingContext.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`chrome-extension://${extensionId}/options/index.html`, {
      waitUntil: 'domcontentloaded'
    });
    await expect.poll(() => held.requested.url).toContain(mobileNavigationChunkName());
    await assertMobileFallbackLayout(page, 390);
    await page.locator('[data-nav-panel="overview"]').click();

    const runKey = async (key: 'Enter' | 'Space', panelId: string) => {
      const target = page.locator(`[data-nav-panel="${panelId}"]`);
      await target.focus();
      const before = await target.evaluate((button) => {
        const sidebar = button.closest<HTMLElement>('.sidebar');
        if (!sidebar) throw new Error('Missing keyboard discriminator sidebar.');
        const buttonRect = button.getBoundingClientRect();
        const sidebarRect = sidebar.getBoundingClientRect();
        button.dataset.keyboardTrace = '';
        button.dataset.keyboardClicks = '0';
        button.dataset.keyboardClickPanel = '';
        button.dataset.keyboardClickScrollTop = '';
        for (const type of ['keydown', 'keyup', 'click']) {
          button.addEventListener(
            type,
            (event) => {
              const keyboard = event instanceof KeyboardEvent ? `:${event.key}` : '';
              button.dataset.keyboardTrace += `${type}${keyboard}|`;
              if (type === 'click') {
                button.dataset.keyboardClicks = String(
                  Number.parseInt(button.dataset.keyboardClicks ?? '0', 10) + 1
                );
                button.dataset.keyboardClickPanel =
                  document.querySelector<HTMLElement>('[data-nav-panel][aria-current="page"]')
                    ?.dataset.navPanel ?? '';
                button.dataset.keyboardClickScrollTop = String(
                  document.querySelector<HTMLElement>('.main')?.scrollTop ?? -1
                );
              }
            },
            { once: true }
          );
        }
        return {
          active: document.activeElement === button,
          buttonVisible:
            buttonRect.top >= sidebarRect.top - 1 && buttonRect.bottom <= sidebarRect.bottom + 1,
          scrollTop: sidebar.scrollTop
        };
      });
      await target.press(key);
      return target.evaluate(
        (button, initial) => ({
          activeAfter: document.activeElement === button,
          activeElement:
            document.activeElement instanceof HTMLElement
              ? (document.activeElement.dataset.panelId ?? document.activeElement.tagName)
              : null,
          ariaCurrent: button.getAttribute('aria-current'),
          before: initial,
          clickCount: Number.parseInt(button.dataset.keyboardClicks ?? '0', 10),
          clickPanel: button.dataset.keyboardClickPanel || null,
          clickScrollTop: Number.parseFloat(button.dataset.keyboardClickScrollTop || '-1'),
          connected: button.isConnected,
          currentPanel:
            document.querySelector<HTMLElement>('[data-nav-panel][aria-current="page"]')?.dataset
              .navPanel ?? null,
          finalScrollTop: document.querySelector<HTMLElement>('.main')?.scrollTop ?? -1,
          targetOffsetTop:
            document.querySelector<HTMLElement>(`[data-panel-id="${button.dataset.navPanel}"]`)
              ?.offsetTop ?? -1,
          trace: button.dataset.keyboardTrace ?? ''
        }),
        before
      );
    };

    const enter = await runKey('Enter', 'storage');
    await page.locator('[data-nav-panel="overview"]').click();
    await settleBrowserFrame(page);
    const space = await runKey('Space', 'capture-sources');
    expect({ enter, space }).toMatchObject({
      enter: {
        activeAfter: false,
        activeElement: 'H1',
        ariaCurrent: 'page',
        before: expect.objectContaining({ active: true, buttonVisible: true }),
        clickCount: 1,
        clickPanel: 'storage',
        connected: true,
        currentPanel: 'storage',
        finalScrollTop: expect.any(Number),
        targetOffsetTop: expect.any(Number),
        trace: expect.stringMatching(/^keydown:Enter\|click\|/u)
      },
      space: {
        activeAfter: false,
        activeElement: 'H1',
        ariaCurrent: 'page',
        before: expect.objectContaining({ active: true, buttonVisible: true }),
        clickCount: 1,
        clickPanel: 'capture-sources',
        connected: true,
        currentPanel: 'capture-sources',
        finalScrollTop: expect.any(Number),
        targetOffsetTop: expect.any(Number),
        trace: expect.stringMatching(/^keydown: \|keyup: \|click\|$/u)
      }
    });
    held.release();
  } finally {
    await pendingContext.close();
    await rm(pendingRoot, { recursive: true, force: true });
  }

  const rejectedRoot = await mkdtemp(join(tmpdir(), 'zendio-f06-focus-discriminator-'));
  const rejectedContext = await chromium.launchPersistentContext(rejectedRoot, {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const rejected = await installRejectedMobileNavigationRoute(rejectedContext);
    const background =
      rejectedContext.serviceWorkers()[0] ??
      (await rejectedContext.waitForEvent('serviceworker', { timeout: 15_000 }));
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id.');
    const page = await rejectedContext.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`chrome-extension://${extensionId}/options/index.html`, {
      waitUntil: 'domcontentloaded'
    });
    await expect.poll(() => rejected.url).toContain(mobileNavigationChunkName());
    await page.evaluate(() => {
      const trace: string[] = [];
      Object.defineProperty(window, '__navigationFocusTrace', { configurable: true, value: trace });
      document.addEventListener(
        'focusin',
        (event) => {
          const target = event.target instanceof HTMLElement ? event.target : null;
          trace.push(
            target?.dataset.navPanel ??
              target?.dataset.footerPanel ??
              target?.getAttribute('role') ??
              target?.tagName ??
              'unknown'
          );
        },
        true
      );
    });
    await page.locator('[data-footer-panel="support"]').click();
    await expect(
      page.locator('.resource-modal-overlay > .resource-modal[role="dialog"]')
    ).toBeFocused();
    await page.locator('.resource-modal-overlay').click({ position: { x: 4, y: 4 } });
    const modalClose = await page.evaluate(() => {
      const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const trace = globalThis.__navigationFocusTrace;
      return {
        activePanel: active?.dataset.navPanel ?? null,
        activeResource: active?.dataset.footerPanel ?? null,
        activeRole: active?.getAttribute('role') ?? null,
        activeTag: active?.tagName ?? null,
        trace: trace ? [...trace] : []
      };
    });
    expect(modalClose).toEqual({
      activePanel: 'overview',
      activeResource: null,
      activeRole: null,
      activeTag: 'BUTTON',
      trace: expect.arrayContaining(['dialog', 'overview'])
    });
  } finally {
    await rejectedContext.close();
    await rm(rejectedRoot, { recursive: true, force: true });
  }
});

test('F06 holds the installed navigation chunk and keeps the pending fallback operable', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'zendio-f06-navigation-pending-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const held = await installHeldMobileNavigationRoute(context);
    const background =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id.');
    const optionsPage = await context.newPage();
    await optionsPage.setViewportSize({ width: 390, height: 844 });
    await optionsPage.goto(`chrome-extension://${extensionId}/options/index.html`, {
      waitUntil: 'domcontentloaded'
    });
    await expect.poll(() => held.requested.url).toContain(mobileNavigationChunkName());

    await assertMobileFallbackLayout(optionsPage, 390);
    await exerciseFallbackDestinations(optionsPage, context);

    const oldSidebar = await optionsPage.locator('.sidebar').elementHandle();
    if (!oldSidebar) throw new Error('Missing pending sidebar handle.');
    await optionsPage
      .locator('[data-panel-id="overview"] .interface-theme-grid select')
      .selectOption('zh-CN');
    await expect(optionsPage.locator('.sidebar nav')).toHaveAttribute('aria-label', '设置');
    await expect.poll(() => oldSidebar.evaluate((element) => element.isConnected)).toBe(false);
    await expect(optionsPage.locator('.sidebar')).toHaveCount(1);

    await assertMobileFallbackLayout(optionsPage, 320);
    await optionsPage.setViewportSize({ width: 1024, height: 768 });
    await expect(optionsPage.locator('#optionsShellRoot')).not.toHaveAttribute(
      'data-mobile-navigation-fallback',
      ''
    );
    await expect
      .poll(() =>
        optionsPage.locator('.sidebar').evaluate((element) => getComputedStyle(element).position)
      )
      .toBe('fixed');
    await assertMobileFallbackLayout(optionsPage, 390);

    const newestSidebar = await optionsPage.locator('.sidebar').elementHandle();
    if (!newestSidebar) throw new Error('Missing newest pending sidebar handle.');
    const activeBeforeResolution = await optionsPage
      .locator('[data-nav-panel][aria-current="page"]')
      .getAttribute('data-nav-panel');
    if (!activeBeforeResolution) throw new Error('Missing active panel before resolution.');
    await optionsPage.locator('[data-footer-panel="support"]').focus();
    held.release();

    const trigger = optionsPage.locator('[data-mobile-navigation-trigger]');
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(optionsPage.locator(`[data-nav-panel="${activeBeforeResolution}"]`)).toBeFocused();
    expect(
      await newestSidebar.evaluate((element) => document.querySelector('.sidebar') === element)
    ).toBe(true);
    await optionsPage.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await expect(optionsPage.locator('.sidebar')).toHaveAttribute('inert', '');
    expect(
      await optionsPage.evaluate(() => ({
        body: document.body.style.overflow,
        main: document.querySelector<HTMLElement>('.main')?.style.overflow ?? ''
      }))
    ).toEqual({ body: '', main: '' });
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('F06 aborts the installed navigation chunk into a permanent non-overlay fallback', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'zendio-f06-navigation-rejected-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const rejected = await installRejectedMobileNavigationRoute(context);
    const background =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id.');
    const pageErrors: string[] = [];
    const optionsPage = await context.newPage();
    optionsPage.on('pageerror', (error) => pageErrors.push(error.message));
    await optionsPage.setViewportSize({ width: 390, height: 844 });
    await optionsPage.goto(`chrome-extension://${extensionId}/options/index.html`, {
      waitUntil: 'domcontentloaded'
    });
    await expect.poll(() => rejected.url).toContain(mobileNavigationChunkName());

    await assertMobileFallbackLayout(optionsPage, 390);
    await exerciseFallbackDestinations(optionsPage, context);
    await assertMobileFallbackLayout(optionsPage, 320);
    await optionsPage.keyboard.press('Escape');
    await expect(optionsPage.locator('#optionsShellRoot')).toHaveAttribute(
      'data-mobile-navigation-fallback',
      ''
    );

    await optionsPage.setViewportSize({ width: 1024, height: 768 });
    await expect(optionsPage.locator('#optionsShellRoot')).not.toHaveAttribute(
      'data-mobile-navigation-fallback',
      ''
    );
    await assertMobileFallbackLayout(optionsPage, 320);
    await optionsPage
      .locator('[data-panel-id="overview"] .interface-theme-grid select')
      .selectOption('zh-CN');
    await expect(optionsPage.locator('.sidebar nav')).toHaveAttribute('aria-label', '设置');
    await expect(optionsPage.locator('.sidebar')).toHaveCount(1);
    await optionsPage.waitForTimeout(50);
    expect(pageErrors).toEqual([]);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('F06 resolves the installed navigation chunk without stealing modal or main focus', async () => {
  const cases = ['active', 'non-current', 'setup', 'dialog', 'main'];

  for (const focusCase of cases) {
    const userDataDir = await mkdtemp(join(tmpdir(), `zendio-f06-navigation-${focusCase}-`));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });

    try {
      const held = await installHeldMobileNavigationRoute(context);
      const background =
        context.serviceWorkers()[0] ??
        (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
      const extensionId = background.url().split('/')[2];
      if (!extensionId) throw new Error('Unable to resolve extension id.');
      const optionsPage = await context.newPage();
      await optionsPage.setViewportSize({ width: 390, height: 844 });
      await optionsPage.goto(`chrome-extension://${extensionId}/options/index.html`, {
        waitUntil: 'domcontentloaded'
      });
      await expect.poll(() => held.requested.url).toContain(mobileNavigationChunkName());
      const sidebar = await optionsPage.locator('.sidebar').elementHandle();
      if (!sidebar) throw new Error('Missing focus-matrix sidebar.');

      if (focusCase === 'active') {
        await optionsPage.locator('[data-nav-panel="overview"]').focus();
      } else if (focusCase === 'non-current') {
        await optionsPage.locator('[data-footer-panel="support"]').focus();
      } else if (focusCase === 'setup') {
        await optionsPage.locator('[data-footer-panel="onboarding"]').focus();
      } else if (focusCase === 'dialog') {
        await optionsPage.locator('[data-footer-panel="support"]').click();
        await expect(
          optionsPage.locator('.resource-modal-overlay > .resource-modal[role="dialog"]')
        ).toBeFocused();
      } else {
        await optionsPage.locator('[data-nav-panel="output"]').click();
        await expect(optionsPage.locator('[data-panel-id="output"] h1')).toBeFocused();
      }

      held.release();
      const trigger = optionsPage.locator('[data-mobile-navigation-trigger]');
      await expect(trigger).toBeVisible();
      expect(
        await sidebar.evaluate((element) => document.querySelector('.sidebar') === element)
      ).toBe(true);

      if (focusCase === 'dialog') {
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await expect(
          optionsPage.locator('.resource-modal-overlay > .resource-modal[role="dialog"]')
        ).toBeFocused();
        await optionsPage.locator('.resource-modal-overlay').click({ position: { x: 4, y: 4 } });
        await expect(trigger).toBeFocused();
      } else if (focusCase === 'main') {
        await expect(trigger).toHaveAttribute('aria-expanded', 'false');
        await expect(optionsPage.locator('[data-panel-id="output"] h1')).toBeFocused();
      } else {
        await expect(trigger).toHaveAttribute('aria-expanded', 'true');
        await expect(optionsPage.locator('[data-nav-panel="overview"]')).toBeFocused();
        await optionsPage.keyboard.press('Escape');
        await expect(trigger).toBeFocused();
      }
    } finally {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  }
});

test('F06 ignores late installed navigation resolution after the Options page is disposed', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'zendio-f06-navigation-disposed-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const held = await installHeldMobileNavigationRoute(context);
    const background =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id.');
    const pageErrors: string[] = [];
    const optionsPage = await context.newPage();
    optionsPage.on('pageerror', (error) => pageErrors.push(error.message));
    await optionsPage.setViewportSize({ width: 390, height: 844 });
    await optionsPage.goto(`chrome-extension://${extensionId}/options/index.html`, {
      waitUntil: 'domcontentloaded'
    });
    await expect.poll(() => held.requested.url).toContain(mobileNavigationChunkName());
    await expect(optionsPage.locator('#optionsShellRoot')).toHaveAttribute(
      'data-mobile-navigation-fallback',
      ''
    );
    await optionsPage.close();
    held.release();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(pageErrors).toEqual([]);
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('F06 keeps every settings and resource route accessible through one installed mobile sidebar', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'zendio-f06-mobile-navigation-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    const background =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id.');
    const optionsPage = await context.newPage();
    await optionsPage.setViewportSize({ width: 390, height: 844 });
    await optionsPage.goto(`chrome-extension://${extensionId}/options/index.html`, {
      waitUntil: 'domcontentloaded'
    });

    const trigger = optionsPage.locator('[data-mobile-navigation-trigger]');
    const sidebar = optionsPage.locator('#options-settings-navigation');
    await expect(optionsPage.locator('.sidebar')).toHaveCount(1);
    await expect(trigger).toBeVisible();
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(sidebar).toHaveAttribute('inert', '');
    await expect(optionsPage.locator('[data-nav-panel="overview"]')).toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(optionsPage.locator('[data-nav-panel][aria-current="page"]')).toHaveCount(1);
    await expect(optionsPage.locator('[data-footer-panel][aria-current="page"]')).toHaveCount(0);

    await trigger.focus();
    await trigger.press('Enter');
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(optionsPage.locator('[data-nav-panel="overview"]')).toBeFocused();
    await optionsPage.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
    await trigger.click();
    await optionsPage.locator('[data-mobile-navigation-close]').focus();
    await optionsPage.keyboard.press('Shift+Tab');
    await expect(optionsPage.locator('[data-footer-panel="changelog"]')).toBeFocused();
    await optionsPage.locator('[data-mobile-navigation-backdrop]').click();
    await expect(trigger).toBeFocused();

    for (const panelId of [
      'overview',
      'storage',
      'capture-sources',
      'capture-behavior',
      'output',
      'maintenance'
    ]) {
      await trigger.click();
      await optionsPage.locator(`[data-nav-panel="${panelId}"]`).click();
      await expect(optionsPage.locator(`[data-nav-panel="${panelId}"]`)).toHaveClass(/is-active/u);
      await expect(optionsPage.locator(`[data-nav-panel="${panelId}"]`)).toHaveAttribute(
        'aria-current',
        'page'
      );
      await expect(optionsPage.locator('[data-nav-panel][aria-current="page"]')).toHaveCount(1);
      await expect(optionsPage.locator(`[data-panel-id="${panelId}"] h1`)).toBeFocused();
    }

    for (const resourceId of ['support', 'suggestions', 'contact', 'changelog']) {
      await trigger.click();
      const resource = optionsPage.locator(`[data-footer-panel="${resourceId}"]`);
      await resource.click();
      await expect(resource).toHaveAttribute('aria-current', 'page');
      await expect(optionsPage.locator('[data-footer-panel][aria-current="page"]')).toHaveCount(1);
      await expect(
        optionsPage.locator('.resource-modal-overlay > .resource-modal[role="dialog"]')
      ).toBeFocused();
      await optionsPage.locator('.resource-modal-overlay').click({ position: { x: 4, y: 4 } });
      await expect(optionsPage.locator('[data-footer-panel][aria-current="page"]')).toHaveCount(0);
      await expect(trigger).toBeFocused();
    }

    const newPage = context.waitForEvent('page');
    await trigger.click();
    await optionsPage.locator('[data-footer-panel="onboarding"]').click();
    const onboardingPage = await newPage;
    await onboardingPage.waitForLoadState('domcontentloaded');
    expect(onboardingPage.url()).toContain('/onboarding/index.html');
    await expect(optionsPage.locator('[data-footer-panel="onboarding"]')).not.toHaveAttribute(
      'aria-current',
      'page'
    );
    await expect(optionsPage.locator('[data-footer-panel][aria-current="page"]')).toHaveCount(0);
    await onboardingPage.close();

    const languageSelect = optionsPage.locator(
      '[data-panel-id="overview"] .interface-theme-grid select'
    );
    await languageSelect.selectOption('zh-CN');
    await expect(optionsPage.locator('[data-mobile-navigation-trigger]')).toHaveText('设置');
    await expect(optionsPage.locator('.sidebar')).toHaveCount(1);

    await optionsPage.setViewportSize({ width: 1024, height: 768 });
    await expect(sidebar).not.toHaveAttribute('inert', '');
    await expect(trigger).toBeHidden();
    await optionsPage.setViewportSize({ width: 320, height: 844 });
    await expect(optionsPage.locator('[data-mobile-navigation-trigger]')).toBeVisible();
    await expect(optionsPage.locator('#options-settings-navigation')).toHaveAttribute('inert', '');
    await expect
      .poll(() =>
        optionsPage.evaluate(() => ({
          documentFits: document.documentElement.scrollWidth <= window.innerWidth,
          sidebarFits:
            (document.querySelector<HTMLElement>('.sidebar')?.scrollWidth ?? 1) <=
            (document.querySelector<HTMLElement>('.sidebar')?.clientWidth ?? 0)
        }))
      )
      .toEqual({ documentFits: true, sidebarFits: true });
  } finally {
    await context.close();
    await rm(userDataDir, { recursive: true, force: true });
  }
});

test('F04 keeps mounted Vault IDs unique across add-delete-add and profile restart', async () => {
  const userDataDir = await mkdtemp(join(tmpdir(), 'zendio-f04-vault-'));
  let context = await chromium.launchPersistentContext(userDataDir, {
    headless: false,
    args: [
      '--headless=new',
      `--disable-extensions-except=${extensionPath}`,
      `--load-extension=${extensionPath}`
    ]
  });

  try {
    let background =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id.');
    const installedOptionsUrl = `chrome-extension://${extensionId}/options/index.html`;
    await background.evaluate(() =>
      chrome.storage.sync.set({
        options: {
          vaultRouter: {
            defaultVaultId: 'default',
            vaults: [
              {
                id: 'default',
                name: 'Zendio',
                vault: 'Zendio',
                httpsUrl: 'https://127.0.0.1:27124/',
                httpUrl: 'http://127.0.0.1:27123/',
                apiKey: '',
                isDefault: true,
                enabled: true
              }
            ]
          }
        }
      })
    );

    let page = await context.newPage();
    await page.goto(installedOptionsUrl, { waitUntil: 'domcontentloaded' });
    await page.locator('[data-nav-panel="storage"]').click();
    const add = page.locator('[data-action-id="storage:addVault"]');
    await add.click();
    await add.click();
    await expect
      .poll(async () =>
        background.evaluate(async () => {
          const stored = await chrome.storage.sync.get<{
            options?: { vaultRouter?: { vaults?: unknown[] } };
          }>('options');
          const options = stored.options;
          return options?.vaultRouter?.vaults?.length;
        })
      )
      .toBe(3);
    await page.locator('[data-action-id="storage:removeVault"]').first().click();
    await expect
      .poll(async () =>
        background.evaluate(async () => {
          const stored = await chrome.storage.sync.get<{
            options?: { vaultRouter?: { vaults?: unknown[] } };
          }>('options');
          const options = stored.options;
          return options?.vaultRouter?.vaults?.length;
        })
      )
      .toBe(2);
    await add.click();
    const lastName = page
      .locator('.storage-vault-table-scroll tbody tr')
      .last()
      .locator('input[type="text"]')
      .first();
    await lastName.fill('Restart-safe Vault');
    await lastName.press('Tab');

    const readIds = () =>
      background.evaluate(async () => {
        const stored = await chrome.storage.sync.get<{
          options?: { vaultRouter?: { vaults?: Array<{ id?: string; name?: string }> } };
        }>('options');
        const options = stored.options;
        return (options?.vaultRouter?.vaults ?? []).map(({ id, name }) => ({ id, name }));
      });
    await expect.poll(readIds).toHaveLength(3);
    const beforeRestart = await readIds();
    expect(beforeRestart.map(({ id }) => id).every((id) => typeof id === 'string')).toBe(true);
    expect(new Set(beforeRestart.map(({ id }) => id)).size).toBe(beforeRestart.length);
    expect(beforeRestart.at(-1)?.name).toBe('Restart-safe Vault');

    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await readIds()).toEqual(beforeRestart);
    await context.close();
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });
    background =
      context.serviceWorkers()[0] ??
      (await context.waitForEvent('serviceworker', { timeout: 15_000 }));
    page = await context.newPage();
    await page.goto(installedOptionsUrl, { waitUntil: 'domcontentloaded' });
    expect(await readIds()).toEqual(beforeRestart);
  } finally {
    await context.close().catch(() => undefined);
    await rm(userDataDir, { recursive: true, force: true });
  }
});
