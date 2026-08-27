import { expect, test } from '@playwright/test';
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

test('Options invalidates owned sections while preserving unrelated browser state', async ({
  page
}) => {
  expect(SECTION_INVALIDATION_SCOPES).toHaveLength(11);
  expect(ROUTING_TEMPLATE_ROWS).toHaveLength(20);
  expect(new Set(ROUTING_TEMPLATE_ROWS.map(([action]) => action)).size).toBe(20);

  await page.addInitScript(() => {
    const originalAdd = EventTarget.prototype.addEventListener;
    const originalRemove = EventTarget.prototype.removeEventListener;
    const counts = { added: 0, removed: 0 };
    Object.defineProperty(window, '__u04bListenerCounts', { value: counts });
    EventTarget.prototype.addEventListener = function (...args) {
      counts.added += 1;
      return originalAdd.apply(this, args);
    };
    EventTarget.prototype.removeEventListener = function (...args) {
      counts.removed += 1;
      return originalRemove.apply(this, args);
    };
  });

  const port = process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? '4181';
  await page.goto(`http://127.0.0.1:${port}/options/index.html`);
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
    Object.defineProperty(window, '__u04bIdentity', {
      configurable: true,
      value: {
        main,
        input,
        output,
        yaml: document.querySelector('.stitch-yaml-config-widget'),
        roots: Object.fromEntries(
          Array.from(document.querySelectorAll<HTMLElement>('[data-panel-id]')).map((root) => [
            root.dataset.panelId,
            root
          ])
        )
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
});
