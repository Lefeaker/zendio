import { expect, test } from '@playwright/test';
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
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

function optionsUrl(): string {
  const port = process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? '4181';
  return `http://127.0.0.1:${port}/options/index.html`;
}

function sectionInvalidationChunkUrl(): string {
  const directory = 'build/dist/chunks';
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
