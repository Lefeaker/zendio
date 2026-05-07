import { expect, test } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  expectNoLegacyRuntimeSurface,
  expectSchemaRuntimeSurface
} from './utils/stitchVisualCompare';
import {
  collectLegacyStyleBridgeCounts,
  collectRuntimeSurfaceContract,
  expectSchemaContract,
  saveRuntimeScreenshot
} from './utils/runtimeSurfaceParity';

const BASE = `http://127.0.0.1:${process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? '4181'}`;
const GENERATED_RUNTIME_PREVIEW_ROOT = resolve(
  process.cwd(),
  '..',
  '.tmp/preview-runtime-alignment/options-component-preview'
);
const CURRENT_GENERATED_PREVIEW_URL = pathToFileURL(
  resolve(GENERATED_RUNTIME_PREVIEW_ROOT, 'index.html')
).toString();
const ZERO_LEGACY_STYLE_BRIDGES = {
  'clipper-tailwind': 0,
  'panel-clipper-tailwind': 0,
  'panel-video-tailwind': 0
};

const PREVIEW_SURFACES = [
  {
    id: 'clipper',
    windowClass: 'clipper-surface-window',
    modalSkin: 'resource-modal--clipper'
  },
  {
    id: 'reader',
    windowClass: 'reader-surface-window',
    modalSkin: 'resource-modal--session'
  },
  {
    id: 'video',
    windowClass: 'video-surface-window',
    modalSkin: 'resource-modal--session'
  },
  {
    id: 'task-success',
    windowClass: 'task-success-window',
    modalSkin: 'resource-modal--task-success'
  }
] as const;

const PRODUCTION_SURFACES = [
  {
    button: 'Open Clipper Dialog',
    status: 'ClipperDialog opened',
    stitchSurface: 'clipper',
    windowClass: 'clipper-surface-window'
  },
  {
    button: 'Start Reader Session',
    status: 'ReaderSession mounted',
    stitchSurface: 'reader',
    windowClass: 'reader-surface-window'
  },
  {
    button: 'Start Video Session',
    status: 'VideoSession mounted and one capture added',
    stitchSurface: 'video',
    windowClass: 'video-surface-window'
  },
  {
    button: 'Show Support Prompt',
    status: 'SupportPrompt mounted',
    stitchSurface: 'task-success',
    windowClass: 'task-success-window'
  }
] as const;

async function openPreviewSurface(
  page: import('@playwright/test').Page,
  id: string
): Promise<void> {
  await page.locator(`[data-footer-panel="${id}"]`).click();
  await expect(page.locator('.resource-modal-overlay')).toBeVisible();
  await page.waitForTimeout(200);
}

async function openProductionSurface(
  page: import('@playwright/test').Page,
  buttonName: string,
  statusText: string,
  stitchSurface: string,
  query = ''
): Promise<import('@playwright/test').Locator> {
  await page.goto(`${BASE}/content-orchestrator-harness.html${query}`);
  const isOptionsDocument = await page.evaluate(() => location.pathname.includes('/options/'));
  expect(isOptionsDocument).toBe(false);
  await expect(page.getByText('Harness ready')).toBeVisible();
  await page.getByRole('button', { name: buttonName }).click();
  await expect(page.getByText(statusText)).toBeVisible({ timeout: 10000 });
  const runtimeSurface = page.locator(`[data-stitch-surface="${stitchSurface}"]`).first();
  await expect(runtimeSurface).toHaveCount(1, { timeout: 10000 });
  await page.waitForTimeout(200);
  return runtimeSurface;
}

async function clickAction(page: import('@playwright/test').Page, actionId: string): Promise<void> {
  await page.locator(`button[data-action-id="${actionId}"]`).first().click();
}

async function expectBottomRightRuntimeSurface(
  page: import('@playwright/test').Page,
  surface: import('@playwright/test').Locator
): Promise<void> {
  const modal = surface.locator('.resource-modal').first();
  const rect = await modal.boundingBox();
  const viewport = page.viewportSize();
  expect(rect).toBeTruthy();
  expect(viewport).toBeTruthy();
  if (!rect || !viewport) {
    throw new Error('missing runtime surface rect');
  }
  expect(rect.x + rect.width).toBeGreaterThan(viewport.width - 48);
  expect(rect.y + rect.height).toBeGreaterThan(viewport.height - 48);

  const styles = await surface.evaluate((element) => {
    const overlay = window.getComputedStyle(element);
    const dialog = element.querySelector<HTMLElement>('.resource-modal');
    const dialogStyle = dialog ? window.getComputedStyle(dialog) : null;
    return {
      overlayPointerEvents: overlay.pointerEvents,
      overlayBackground: overlay.backgroundColor,
      overlayDisplay: overlay.display,
      overlayAlignItems: overlay.alignItems,
      overlayJustifyContent: overlay.justifyContent,
      overlayPadding: overlay.padding,
      modalPointerEvents: dialogStyle?.pointerEvents ?? ''
    };
  });
  expect(styles.overlayPointerEvents).toBe('none');
  expect(styles.overlayBackground).toBe('rgba(0, 0, 0, 0)');
  expect(styles.overlayDisplay).toBe('flex');
  expect(styles.overlayAlignItems).toBe('flex-end');
  expect(styles.overlayJustifyContent).toBe('flex-end');
  expect(styles.overlayPadding).not.toBe('0px');
  expect(styles.modalPointerEvents).toBe('auto');
}

async function collectFloatingPromptContract(root: import('@playwright/test').Locator) {
  const bubble = root.locator('.video-floating-prompt__bubble').first();
  const hint = root.locator('.video-floating-prompt__hint').first();
  const close = root.locator('.video-floating-prompt__close').first();
  await expect(bubble).toBeVisible({ timeout: 10000 });
  await expect(hint).toBeVisible({ timeout: 10000 });
  await expect(close).toHaveCount(1);

  const readComputed = async (
    node: import('@playwright/test').Locator,
    keys: string[]
  ): Promise<Record<string, string>> =>
    node.evaluate((element, styleKeys) => {
      const style = window.getComputedStyle(element);
      return Object.fromEntries(styleKeys.map((key) => [key, style.getPropertyValue(key)]));
    }, keys);

  return {
    rootClasses: await root.evaluate((node) => Array.from(node.classList)),
    stitchSurface: await root.getAttribute('data-stitch-surface'),
    schemaCounts: {
      prompt: await root.count(),
      bubble: await root.locator('.video-floating-prompt__bubble').count(),
      hint: await root.locator('.video-floating-prompt__hint').count(),
      close: await root.locator('.video-floating-prompt__close').count()
    },
    legacyCounts: {
      prompt: await root.locator('.aiob-video-prompt').count(),
      bubble: await root.locator('.aiob-video-prompt__bubble').count(),
      hint: await root.locator('.aiob-video-prompt__hint').count(),
      close: await root.locator('.aiob-video-prompt__close').count()
    },
    legacyStyleBridgeCounts: await collectLegacyStyleBridgeCounts(root),
    label: (await bubble.getAttribute('aria-label')) ?? '',
    hintText: (await hint.textContent())?.replace(/\s+/g, ' ').trim() ?? '',
    computed: {
      root: await readComputed(root, ['position', 'right', 'bottom', 'z-index', 'pointer-events']),
      bubble: await readComputed(bubble, [
        'display',
        'min-height',
        'max-width',
        'border-radius',
        'pointer-events'
      ])
    }
  };
}

function expectRuntimeStyleParity(
  surfaceId: string,
  production: Awaited<ReturnType<typeof collectRuntimeSurfaceContract>>,
  preview: Awaited<ReturnType<typeof collectRuntimeSurfaceContract>>
): void {
  const normalizeValue = (value: string): string => {
    const rgba = value.match(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*(0(?:\.\d+)?)\s*\)$/);
    return rgba && Number(rgba[1]) <= 0.06 ? 'transparent' : value;
  };
  const pick = (source: Record<string, string>, keys: string[]): Record<string, string> =>
    Object.fromEntries(keys.map((key) => [key, normalizeValue(source[key] ?? '')]));
  const expectVerticallyCentered = (
    modal: Record<string, number>,
    overlay: Record<string, number>
  ): void => {
    const expectedY = Math.round((overlay.height - modal.height) / 2);
    expect(Math.abs(modal.y - expectedY)).toBeLessThanOrEqual(1);
  };
  expect(production.cssVariables).toEqual(preview.cssVariables);
  expect(production.rootClasses).not.toContain('modal');
  expect(production.rootClasses).not.toContain('modal-open');
  expect(production.legacyStyleBridgeCounts).toEqual({
    'clipper-tailwind': 0,
    'panel-clipper-tailwind': 0,
    'panel-video-tailwind': 0
  });
  expect(
    pick(production.computed.overlay, [
      'position',
      'inset',
      'transform',
      'display',
      'align-items',
      'justify-content',
      'padding',
      'background-color',
      'pointer-events'
    ])
  ).toEqual(
    pick(preview.computed.overlay, [
      'position',
      'inset',
      'transform',
      'display',
      'align-items',
      'justify-content',
      'padding',
      'background-color',
      'pointer-events'
    ])
  );
  expect(Number(production.computed.overlay['z-index'])).toBeGreaterThanOrEqual(
    Number(preview.computed.overlay['z-index'])
  );
  expect(pick(production.computed.modal, ['position', 'left', 'top', 'transform'])).toEqual(
    pick(preview.computed.modal, ['position', 'left', 'top', 'transform'])
  );
  if (surfaceId === 'reader' || surfaceId === 'video') {
    const productionMaxHeight = Number.parseFloat(production.computed.modal['max-height'] ?? '0');
    expect(productionMaxHeight).toBeLessThanOrEqual(production.rects.overlay.height * 0.5 + 1);
  } else {
    expect(pick(production.computed.modal, ['max-height'])).toEqual(
      pick(preview.computed.modal, ['max-height'])
    );
  }
  if (surfaceId === 'clipper') {
    expect(production.rects.modal.width).toBe(preview.rects.modal.width);
    expect(production.rects.modal.x).toBe(preview.rects.modal.x);
    expectVerticallyCentered(production.rects.modal, production.rects.overlay);
    expectVerticallyCentered(preview.rects.modal, preview.rects.overlay);
  }
  expect(production.computed.surfaceWindow).toEqual(preview.computed.surfaceWindow);
  expect(pick(production.computed.primaryButton, ['borderRadius', 'minHeight'])).toEqual(
    pick(preview.computed.primaryButton, ['borderRadius', 'minHeight'])
  );
  expect(production.computed.body).toEqual(preview.computed.body);
  expect(production.computed.header).toEqual(preview.computed.header);
  if (Object.keys(preview.computed.input).length > 0) {
    expect(pick(production.computed.input, ['background-color', 'border-radius', 'color'])).toEqual(
      pick(preview.computed.input, ['background-color', 'border-radius', 'color'])
    );
  }
}

function getRuntimePreviewUrl(surfaceId: string): string {
  void surfaceId;
  return CURRENT_GENERATED_PREVIEW_URL;
}

test.describe('Stitch runtime surface alignment', () => {
  test.beforeAll(() => {
    execFileSync(
      process.execPath,
      [
        resolve(process.cwd(), 'scripts/build-preview.mjs'),
        '--outdir',
        GENERATED_RUNTIME_PREVIEW_ROOT
      ],
      {
        cwd: process.cwd(),
        stdio: 'inherit'
      }
    );
  });

  for (const surface of PREVIEW_SURFACES) {
    test(`${surface.id} preview schema exposes the Stitch surface contract`, async ({ page }) => {
      await page.goto(getRuntimePreviewUrl(surface.id));
      await page.waitForSelector('.app');

      await openPreviewSurface(page, surface.id);

      const modal = page.locator('.resource-modal').first();
      await expect(modal).toHaveClass(new RegExp(surface.modalSkin));
      await expect(page.locator(`.${surface.windowClass}`).first()).toBeVisible();
      await expect(
        page.locator('.surface-window-header, .clipper-header, .task-success-header').first()
      ).toBeVisible();
      await expect(
        page.locator('.surface-window-body, .clipper-body, .task-success-body').first()
      ).toBeVisible();
    });
  }

  for (const surface of PRODUCTION_SURFACES) {
    test(`${surface.stitchSurface} production runtime mounts the Stitch contract`, async ({
      page
    }) => {
      await page.goto(`${BASE}/content-orchestrator-harness.html`);
      await expect(page.getByText('Harness ready')).toBeVisible();

      await page.getByRole('button', { name: surface.button }).click();

      await expect(page.getByText(surface.status)).toBeVisible({ timeout: 10000 });
      const runtimeSurface = page
        .locator(`[data-stitch-surface="${surface.stitchSurface}"]`)
        .first();
      await expect(runtimeSurface).toHaveCount(1, { timeout: 10000 });
      await expect(runtimeSurface).toHaveClass(/stitch-runtime-surface/);
      await expect(page.locator(`.${surface.windowClass}`).first()).toHaveCount(1);
      await expectSchemaRuntimeSurface(runtimeSurface);
      await expectNoLegacyRuntimeSurface(runtimeSurface);
    });
  }

  for (const surface of PRODUCTION_SURFACES) {
    test(`${surface.stitchSurface} preview and production share schema surface contracts`, async ({
      page
    }, testInfo) => {
      await page.goto(getRuntimePreviewUrl(surface.stitchSurface));
      await page.waitForSelector('.app');
      await openPreviewSurface(page, surface.stitchSurface);
      const previewSurface = page.locator('.resource-modal-overlay').first();
      const preview = await collectRuntimeSurfaceContract(previewSurface);
      expectSchemaContract(preview);
      await saveRuntimeScreenshot(page, testInfo, `${surface.stitchSurface}-preview-runtime`);

      const productionSurface = await openProductionSurface(
        page,
        surface.button,
        surface.status,
        surface.stitchSurface
      );
      const production = await collectRuntimeSurfaceContract(productionSurface);
      expectSchemaContract(production);
      await saveRuntimeScreenshot(page, testInfo, `${surface.stitchSurface}-production-runtime`);

      expect(production.schemaSelectorCounts).toEqual(preview.schemaSelectorCounts);
      expect(production.legacySelectorCounts).toEqual(preview.legacySelectorCounts);
      if (preview.buttonActionIds.length > 0) {
        expect(Array.from(new Set(production.buttonActionIds))).toEqual(
          Array.from(new Set(preview.buttonActionIds))
        );
      }
      expectRuntimeStyleParity(surface.stitchSurface, production, preview);
      expect(production.buttonActionLabels.length).toBeGreaterThan(0);
    });
  }

  for (const surface of PRODUCTION_SURFACES) {
    test(`${surface.stitchSurface} production runtime follows the light Stitch theme`, async ({
      page
    }) => {
      await page.goto(getRuntimePreviewUrl(surface.stitchSurface));
      await page.waitForSelector('.app');
      await page.evaluate(() => {
        document.documentElement.dataset.previewTheme = 'light';
        document.documentElement.dataset.theme = 'light';
      });
      await openPreviewSurface(page, surface.stitchSurface);
      const previewSurface = page.locator('.resource-modal-overlay').first();
      const preview = await collectRuntimeSurfaceContract(previewSurface);

      await page.goto(`${BASE}/content-orchestrator-harness.html?interfaceTheme=light`);
      await page.evaluate(() => {
        document.documentElement.dataset.previewTheme = 'unexpected-host-value';
        document.body.dataset.previewTheme = 'dark';
      });
      await expect(page.getByText('Harness ready')).toBeVisible();
      await page.getByRole('button', { name: surface.button }).click();
      await expect(page.getByText(surface.status)).toBeVisible({ timeout: 10000 });
      const productionSurface = page
        .locator(`[data-stitch-surface="${surface.stitchSurface}"]`)
        .first();
      await expect(productionSurface).toHaveAttribute('data-preview-theme', 'light');
      const production = await collectRuntimeSurfaceContract(productionSurface);

      expectRuntimeStyleParity(surface.stitchSurface, production, preview);
    });
  }

  test('video floating prompt preview and production share the Stitch schema contract', async ({
    page
  }, testInfo) => {
    await page.goto(CURRENT_GENERATED_PREVIEW_URL);
    await page.waitForSelector('.app');
    await page.locator('[data-footer-panel="video-floating-prompt"]').click();
    const previewPrompt = page.locator('.video-floating-prompt').first();
    const preview = await collectFloatingPromptContract(previewPrompt);
    await saveRuntimeScreenshot(page, testInfo, 'video-floating-prompt-preview-runtime');

    await page.goto(`${BASE}/content-orchestrator-harness.html`);
    await expect(page.getByText('Harness ready')).toBeVisible();
    await page.getByRole('button', { name: 'Show Video Floating Prompt' }).click();
    await expect(page.getByText('Video floating prompt mounted')).toBeVisible({ timeout: 10000 });
    const productionPrompt = page.locator('[data-stitch-surface="video-floating-prompt"]').first();
    const production = await collectFloatingPromptContract(productionPrompt);
    await saveRuntimeScreenshot(page, testInfo, 'video-floating-prompt-production-runtime');

    expect(production.stitchSurface).toBe('video-floating-prompt');
    expect(production.rootClasses).toEqual(
      expect.arrayContaining(['stitch-runtime-surface', 'video-floating-prompt'])
    );
    expect(production.schemaCounts).toEqual(preview.schemaCounts);
    expect(production.legacyCounts).toEqual(preview.legacyCounts);
    expect(production.legacyCounts).toEqual({ prompt: 0, bubble: 0, hint: 0, close: 0 });
    expect(production.legacyStyleBridgeCounts).toEqual(ZERO_LEGACY_STYLE_BRIDGES);
    expect(preview.legacyStyleBridgeCounts).toEqual(ZERO_LEGACY_STYLE_BRIDGES);
    expect(production.label).toBe(preview.label);
    expect(production.hintText).toBe(preview.hintText);
    expect(production.computed).toEqual(preview.computed);
  });

  test('video floating prompt preview and production share the light Stitch runtime theme', async ({
    page
  }) => {
    await page.goto(CURRENT_GENERATED_PREVIEW_URL);
    await page.waitForSelector('.app');
    await page.evaluate(() => {
      document.documentElement.dataset.previewTheme = 'light';
      document.documentElement.dataset.theme = 'light';
    });
    await page.locator('[data-footer-panel="video-floating-prompt"]').click();
    const previewPrompt = page.locator('.video-floating-prompt').first();
    const preview = await collectFloatingPromptContract(previewPrompt);

    await page.goto(`${BASE}/content-orchestrator-harness.html?interfaceTheme=light`);
    await page.evaluate(() => {
      document.documentElement.dataset.previewTheme = 'unexpected-host-value';
      document.body.dataset.previewTheme = 'dark';
    });
    await expect(page.getByText('Harness ready')).toBeVisible();
    await page.getByRole('button', { name: 'Show Video Floating Prompt' }).click();
    await expect(page.getByText('Video floating prompt mounted')).toBeVisible({ timeout: 10000 });
    const productionPrompt = page.locator('[data-stitch-surface="video-floating-prompt"]').first();
    await expect(productionPrompt).toHaveAttribute('data-preview-theme', 'light');
    const production = await collectFloatingPromptContract(productionPrompt);

    expect(production.legacyStyleBridgeCounts).toEqual(ZERO_LEGACY_STYLE_BRIDGES);
    expect(production.computed).toEqual(preview.computed);
  });

  test('production runtime ignores hostile host page theme attributes without controlled runtime theme', async ({
    page
  }) => {
    await page.goto(`${BASE}/content-orchestrator-harness.html`);
    await page.evaluate(() => {
      document.documentElement.dataset.previewTheme = 'light';
      document.body.dataset.previewTheme = 'light';
      delete (window as Window & { __AI2OB_STITCH_RUNTIME_THEME__?: string })
        .__AI2OB_STITCH_RUNTIME_THEME__;
    });
    await expect(page.getByText('Harness ready')).toBeVisible();
    await page.getByRole('button', { name: 'Open Clipper Dialog' }).click();
    await expect(page.getByText('ClipperDialog opened')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-stitch-surface="clipper"]').first()).toHaveAttribute(
      'data-preview-theme',
      'dark'
    );
  });

  test('production clipper confirms through Stitch action buttons and cancels without a visible cancel button', async ({
    page
  }) => {
    await openProductionSurface(page, 'Open Clipper Dialog', 'ClipperDialog opened', 'clipper');
    await expect(page.locator('button[data-action-id="cancel"]')).toHaveCount(0);
    await clickAction(page, 'clip');
    await expect(page.getByText('ClipperDialog confirmed')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-stitch-surface="clipper"]')).toHaveCount(0);

    await openProductionSurface(page, 'Open Clipper Dialog', 'ClipperDialog opened', 'clipper');
    await expect(page.locator('button[data-action-id="cancel"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(page.getByText('ClipperDialog cancel')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-stitch-surface="clipper"]')).toHaveCount(0);
  });

  test('production clipper overlay close uses the Stitch resource close action', async ({
    page
  }) => {
    await openProductionSurface(page, 'Open Clipper Dialog', 'ClipperDialog opened', 'clipper');
    await page.locator('[data-stitch-surface="clipper"]').click({ position: { x: 4, y: 4 } });
    await expect(page.getByText('ClipperDialog cancel')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-stitch-surface="clipper"]')).toHaveCount(0);
  });

  test('production reader supports edit, finish, and cancel through Stitch actions', async ({
    page
  }) => {
    await openProductionSurface(page, 'Start Reader Session', 'ReaderSession mounted', 'reader');
    const noteInput = page.locator('[data-highlight-input]').first();
    await expect(noteInput).toBeVisible();
    await noteInput.fill('Updated reader harness note');
    await noteInput.press('Enter');
    await expect(page.locator('[data-highlight-input]').first()).toHaveValue(
      'Updated reader harness note'
    );

    await clickAction(page, 'reader:finish');
    await expect(page.getByText('ReaderSession exported once')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-stitch-surface="reader"]')).toHaveCount(0);

    await openProductionSurface(page, 'Start Reader Session', 'ReaderSession mounted', 'reader');
    await clickAction(page, 'reader:cancel');
    await expect(page.locator('[data-stitch-surface="reader"]')).toHaveCount(0);
  });

  test('production reader is a non-blocking bottom-right panel and allows page text selection', async ({
    page
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-desktop',
      'Desktop mouse selection is the acceptance path for the non-blocking Reader panel.'
    );
    await openProductionSurface(page, 'Start Reader Session', 'ReaderSession mounted', 'reader');
    const panel = page.locator('.reader-surface-window').first();
    await expect(panel).toBeVisible();

    const panelRect = await panel.boundingBox();
    const viewport = page.viewportSize();
    expect(panelRect).toBeTruthy();
    expect(viewport).toBeTruthy();
    if (!panelRect || !viewport) {
      throw new Error('missing panel or viewport rect');
    }
    expect(panelRect.x + panelRect.width).toBeGreaterThan(viewport.width - 48);
    expect(panelRect.y + panelRect.height).toBeGreaterThan(viewport.height - 48);
    await expectBottomRightRuntimeSurface(
      page,
      page.locator('[data-stitch-surface="reader"]').first()
    );
    await expect(page.locator('[data-action-id="reader:save"]')).toHaveCount(0);
    await expect(
      page.locator('.surface-window-header [data-action-id="resource:close"]')
    ).toHaveCount(0);
    await expect(
      page.locator(
        'article[data-highlight-id] .session-item-close-trigger[data-action-id="reader:delete"]'
      )
    ).toHaveCount(1);
    await expect(page.locator('[data-stitch-surface="reader"] .session-item-actions')).toHaveCount(
      0
    );

    const article = page.locator('#reader-article p').first();
    const articleRect = await article.boundingBox();
    if (!articleRect) {
      throw new Error('missing reader article rect');
    }
    const hitPoint = {
      x: Math.round(articleRect.x + Math.min(120, articleRect.width / 3)),
      y: Math.round(articleRect.y + Math.min(18, articleRect.height / 2))
    };
    const hitTarget = await page.evaluate(({ x, y }) => {
      const element = document.elementFromPoint(x, y);
      return {
        insideArticle: Boolean(element?.closest('#reader-article')),
        insideReaderSurface: Boolean(element?.closest('[data-stitch-surface="reader"]'))
      };
    }, hitPoint);
    expect(hitTarget).toEqual({ insideArticle: true, insideReaderSurface: false });

    const highlights = page.locator('[data-stitch-surface="reader"] article[data-highlight-id]');
    const beforeCount = await highlights.count();
    await page.mouse.move(articleRect.x + 24, articleRect.y + 18);
    await page.mouse.down();
    await page.mouse.move(
      articleRect.x + Math.min(340, articleRect.width - 12),
      articleRect.y + 18,
      {
        steps: 8
      }
    );
    await page.mouse.up();

    await expect(highlights).toHaveCount(beforeCount + 1, { timeout: 10000 });
    await page
      .locator('.resource-modal--session')
      .first()
      .evaluate((modal) => {
        const panel = modal as HTMLElement;
        panel.style.setProperty('--aiob-session-panel-max-height', '90vh');
        panel.style.height = '320px';
      });
    const readerListLayout = await page
      .locator('[data-stitch-surface="reader"] .session-item-list')
      .evaluate((list) => {
        const cards = Array.from(list.querySelectorAll<HTMLElement>('.reader-session-item-card'));
        return cards.map((card, index) => {
          const rect = card.getBoundingClientRect();
          const nextRect = cards[index + 1]?.getBoundingClientRect();
          const selection = card.querySelector<HTMLElement>('.reader-selection-text');
          const input = card.querySelector<HTMLElement>('.session-item-comment-input');
          const selectionRect = selection?.getBoundingClientRect();
          const inputRect = input?.getBoundingClientRect();
          return {
            cardBottom: rect.bottom,
            nextTop: nextRect?.top ?? null,
            selectionBottom: selectionRect?.bottom ?? null,
            inputTop: inputRect?.top ?? null
          };
        });
      });
    expect(readerListLayout.length).toBeGreaterThanOrEqual(2);
    for (const item of readerListLayout) {
      if (item.inputTop !== null && item.selectionBottom !== null) {
        expect(item.selectionBottom).toBeLessThanOrEqual(item.inputTop + 1);
      }
      if (item.nextTop !== null) {
        expect(item.cardBottom).toBeLessThanOrEqual(item.nextTop + 1);
      }
    }
    const capturedText = page
      .locator('[data-stitch-surface="reader"] .reader-selection-text')
      .last();
    await expect(capturedText).toHaveCSS('-webkit-line-clamp', '2');
    await expect(capturedText).toHaveAttribute('aria-expanded', 'false');
    await capturedText.click();
    await expect(capturedText).toHaveClass(/is-expanded/);
    await expect(capturedText).toHaveAttribute('aria-expanded', 'true');
    await page.locator('[data-stitch-surface="reader"] .surface-window-footer').click();
    await expect(capturedText).not.toHaveClass(/is-expanded/);
    await expect(capturedText).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#obsidian-clipper-dialog')).toHaveCount(0);
    await expect(page.locator('[data-stitch-surface="clipper"]')).toHaveCount(0);
  });

  test('production reader collapse shrinks to bottom-right header and releases page hit targets', async ({
    page
  }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-desktop',
      'Collapsed Reader placement is a desktop floating-panel contract.'
    );
    await page.addInitScript(() => {
      const persisted: Record<string, number> = {
        'aiob.sessionPanel.width': 576,
        'aiob.sessionPanel.maxWidth': 576,
        'aiob.sessionPanel.height': 520
      };
      const chromeMock = {
        storage: {
          local: {
            get(keys: string[], callback: (items: Record<string, number>) => void) {
              callback(
                keys.reduce<Record<string, number>>((items, key) => {
                  if (key in persisted) {
                    items[key] = persisted[key];
                  }
                  return items;
                }, {})
              );
            },
            set(items: Record<string, number>) {
              Object.assign(persisted, items);
            }
          }
        }
      };
      Object.defineProperty(window, 'chrome', {
        configurable: true,
        value: chromeMock
      });
    });
    const surface = await openProductionSurface(
      page,
      'Start Reader Session',
      'ReaderSession mounted',
      'reader'
    );
    const modal = surface.locator('.resource-modal--session').first();
    const windowPanel = surface.locator('.reader-surface-window').first();
    const header = surface.locator('.surface-window-header').first();
    await surface.locator('[data-action-id="session:toggleCollapse"]').click();
    await expect(modal).toHaveClass(/is-collapsed/);

    const modalRect = await modal.boundingBox();
    const windowRect = await windowPanel.boundingBox();
    const headerRect = await header.boundingBox();
    const viewport = page.viewportSize();
    expect(modalRect).toBeTruthy();
    expect(windowRect).toBeTruthy();
    expect(headerRect).toBeTruthy();
    expect(viewport).toBeTruthy();
    if (!modalRect || !windowRect || !headerRect || !viewport) {
      throw new Error('missing collapsed reader rects');
    }
    const video = page.locator('video').first();
    const videoRect = await video.boundingBox();
    if (!videoRect) {
      throw new Error('missing video fixture rect');
    }
    const hitPoint = {
      x: Math.round(videoRect.x + videoRect.width / 2),
      y: Math.round(videoRect.y + videoRect.height / 2)
    };
    const hit = await page.evaluate(({ x, y }) => {
      const hitElement = document.elementFromPoint(x, y);
      return {
        insideVideoFixture: Boolean(hitElement?.closest('video')),
        insideReaderSurface: Boolean(hitElement?.closest('[data-stitch-surface="reader"]'))
      };
    }, hitPoint);

    expect(modalRect.x + modalRect.width).toBeGreaterThan(viewport.width - 48);
    expect(modalRect.y + modalRect.height).toBeGreaterThan(viewport.height - 48);
    expect(windowRect.x + windowRect.width).toBeGreaterThan(viewport.width - 48);
    expect(windowRect.y + windowRect.height).toBeGreaterThan(viewport.height - 48);
    expect(headerRect.x + headerRect.width).toBeGreaterThan(viewport.width - 48);
    expect(headerRect.y + headerRect.height).toBeGreaterThan(viewport.height - 48);
    expect(modalRect.height).toBeLessThan(120);
    expect(windowRect.height).toBeLessThan(120);
    expect(hit).toEqual({ insideVideoFixture: true, insideReaderSurface: false });

    await expect(windowPanel).toHaveClass(/is-collapsed/);
    await expect(header).toBeVisible();
  });

  test('production video is a non-blocking bottom-right floating panel', async ({ page }) => {
    const surface = await openProductionSurface(
      page,
      'Start Video Session',
      'VideoSession mounted and one capture added',
      'video'
    );
    await expectBottomRightRuntimeSurface(page, surface);

    const article = page.locator('#reader-article p').first();
    const articleRect = await article.boundingBox();
    if (!articleRect) {
      throw new Error('missing article rect');
    }
    const hitTarget = await page.evaluate(
      ({ x, y }) => {
        const element = document.elementFromPoint(x, y);
        return {
          insideArticle: Boolean(element?.closest('#reader-article')),
          insideVideoSurface: Boolean(element?.closest('[data-stitch-surface="video"]'))
        };
      },
      {
        x: Math.round(articleRect.x + Math.min(120, articleRect.width / 3)),
        y: Math.round(articleRect.y + Math.min(18, articleRect.height / 2))
      }
    );
    expect(hitTarget).toEqual({ insideArticle: true, insideVideoSurface: false });

    const captures = page.locator('[data-stitch-surface="video"] article[data-capture-id]');
    const beforeCount = await captures.count();
    await page.mouse.move(articleRect.x + 24, articleRect.y + 18);
    await page.mouse.down();
    await page.mouse.move(
      articleRect.x + Math.min(340, articleRect.width - 12),
      articleRect.y + 18,
      {
        steps: 8
      }
    );
    await page.mouse.up();

    await expect(captures).toHaveCount(beforeCount + 1, { timeout: 10000 });
    const fragment = page
      .locator('[data-stitch-surface="video"] .video-fragment-session-item-card')
      .last();
    await expect(fragment.locator('.session-item-marker-index')).toHaveText('1');
    const fragmentInput = fragment.locator('[data-capture-input]');
    await expect(fragmentInput).toHaveAttribute('placeholder', /note|批注/i);
    await expect(fragmentInput).not.toHaveAttribute('placeholder', /timestamp|时间点/i);
    const fragmentText = fragment.locator('.reader-selection-text');
    await expect(fragmentText).toHaveCSS('-webkit-line-clamp', '2');
    await fragmentText.click();
    await expect(fragmentText).toHaveClass(/is-expanded/);
    await page.locator('[data-stitch-surface="video"] .surface-window-footer').click();
    await expect(fragmentText).not.toHaveClass(/is-expanded/);
  });

  test('production video supports finish and cancel without preview-absent capture actions', async ({
    page
  }) => {
    await openProductionSurface(
      page,
      'Start Video Session',
      'VideoSession mounted and one capture added',
      'video'
    );
    const captures = page.locator('article[data-capture-id]');
    await expect(captures).toHaveCount(1);
    await expect(
      page.locator('.surface-window-header [data-action-id="resource:close"]')
    ).toHaveCount(0);
    await expect(page.locator('.session-footer-actions [data-action-id="video:add"]')).toHaveCount(
      0
    );
    await expect(
      page.locator('.session-add-capture-button[data-action-id="video:add"]')
    ).toHaveCount(1);
    await expect(page.locator('[data-action-id="video:add-note"]')).toHaveCount(1);
    await expect(page.locator('[data-action-id="video:add-note"]')).not.toBeDisabled();
    await expect(page.locator('[data-action-id="video:save"]')).toHaveCount(0);
    await expect(
      page.locator(
        'article[data-capture-id] .session-item-close-trigger[data-action-id="video:delete"]'
      )
    ).toHaveCount(1);
    await expect(page.locator('article[data-capture-id] .session-item-actions')).toHaveCount(0);
    await expect(page.locator('[data-capture-input]').first()).toHaveJSProperty('tagName', 'INPUT');

    await clickAction(page, 'video:finish');
    await expect(page.getByText('VideoSession exported once')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('[data-stitch-surface="video"]')).toHaveCount(0);

    await openProductionSurface(
      page,
      'Start Video Session',
      'VideoSession mounted and one capture added',
      'video'
    );
    await clickAction(page, 'video:cancel');
    await expect(page.locator('[data-stitch-surface="video"]')).toHaveCount(0);
  });

  test('production task-success like and dislike actions trigger runtime toasts', async ({
    page
  }) => {
    await openProductionSurface(
      page,
      'Show Support Prompt',
      'SupportPrompt mounted',
      'task-success'
    );
    await clickAction(page, 'task-success:like');
    await expect(page.locator('#aiob-support-toast [data-role="like-toast-message"]')).toBeVisible({
      timeout: 10000
    });
    await page.evaluate(() => {
      (window as Window & { __AI2OB_TEST_REVIEW_OPENED__?: string }).__AI2OB_TEST_REVIEW_OPENED__ =
        '';
      window.open = (url?: string | URL) => {
        (
          window as Window & { __AI2OB_TEST_REVIEW_OPENED__?: string }
        ).__AI2OB_TEST_REVIEW_OPENED__ = String(url ?? '');
        return null;
      };
    });
    await page
      .locator('#aiob-support-toast [data-role="review-link-btn"]')
      .click({ timeout: 5000 });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { __AI2OB_TEST_REVIEW_OPENED__?: string })
              .__AI2OB_TEST_REVIEW_OPENED__
        )
      )
      .toContain('chromewebstore.google.com');

    await page.getByRole('button', { name: 'Show Support Prompt' }).click();
    await expect(page.getByText('SupportPrompt mounted')).toBeVisible({ timeout: 10000 });
    await clickAction(page, 'task-success:like');
    await expect(
      page.locator('#aiob-support-toast [data-role="review-acknowledged-btn"]')
    ).toBeVisible({
      timeout: 10000
    });
    await page
      .locator('#aiob-support-toast [data-role="review-acknowledged-btn"]')
      .evaluate((button) => {
        button.addEventListener(
          'click',
          () => {
            (
              window as Window & { __AI2OB_TEST_REVIEW_ACK_CLICKED__?: boolean }
            ).__AI2OB_TEST_REVIEW_ACK_CLICKED__ = true;
          },
          { once: true }
        );
      });
    await page
      .locator('#aiob-support-toast [data-role="review-acknowledged-btn"]')
      .click({ timeout: 5000 });
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            (window as Window & { __AI2OB_TEST_REVIEW_ACK_CLICKED__?: boolean })
              .__AI2OB_TEST_REVIEW_ACK_CLICKED__ === true
        )
      )
      .toBe(true);

    await openProductionSurface(
      page,
      'Show Support Prompt',
      'SupportPrompt mounted',
      'task-success'
    );
    await clickAction(page, 'task-success:dislike');
    await expect(page.locator('#aiob-support-toast [data-role="dislike-toast-title"]')).toBeVisible(
      {
        timeout: 10000
      }
    );
    await expect(page.locator('#aiob-support-toast [data-role="qr-container"]')).toHaveCount(0);
    await expect(page.locator('#aiob-support-toast [data-role="qr-toggle-btn"]')).toHaveCount(0);
    await expect(page.locator('#aiob-support-toast [data-role="github-link"]')).toBeVisible();
  });

  test('runtime legacy bridge guard detects adoptedStyleSheets signatures', async ({ page }) => {
    await page.setContent(`
      <div id="host"></div>
      <script>
        const host = document.getElementById('host');
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = \`
          <div data-stitch-surface="clipper" class="stitch-runtime-surface resource-modal-overlay" style="position:fixed;inset:0;z-index:2147483647;">
            <div class="resource-modal" style="position:relative;width:320px;max-height:420px;">
              <section class="surface-window" style="background:rgb(20,20,20);border:1px solid rgb(80,80,80);color:white;--runtime-panel:rgb(20,20,20);--runtime-line:rgb(80,80,80);--accent:rgb(124,92,255);">
                <header class="surface-window-header" style="padding:16px;border-bottom:1px solid rgb(80,80,80);">Header</header>
                <div class="surface-window-body" style="padding:16px;gap:8px;">
                  <button class="btn primary" data-action-id="clip" style="min-height:32px;border-radius:8px;">Clip</button>
                </div>
              </section>
            </div>
          </div>
        \`;
        const sheet = new CSSStyleSheet();
        sheet.replaceSync('.clipper-btn{border-radius:10px}.modal-box{padding:24px}');
        const videoSheet = new CSSStyleSheet();
        videoSheet.replaceSync('.z-\\\\[2147483645\\\\]{z-index:2147483645}.max-w-\\\\[240px\\\\]{max-width:240px}');
        shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet, videoSheet];
      </script>
    `);
    const contract = await collectRuntimeSurfaceContract(
      page.locator('[data-stitch-surface="clipper"]').first()
    );
    expect(contract.legacyStyleBridgeCounts['clipper-tailwind']).toBeGreaterThan(0);
    expect(contract.legacyStyleBridgeCounts['panel-video-tailwind']).toBeGreaterThan(0);
  });

  test('floating prompt legacy bridge guard detects adoptedStyleSheets signatures', async ({
    page
  }) => {
    await page.setContent(`
      <div id="host"></div>
      <script>
        const host = document.getElementById('host');
        const shadow = host.attachShadow({ mode: 'open' });
        shadow.innerHTML = \`
          <div data-stitch-surface="video-floating-prompt" class="stitch-runtime-surface video-floating-prompt" style="position:fixed;right:24px;bottom:24px;z-index:2147483645;pointer-events:none;">
            <button class="video-floating-prompt__bubble" aria-label="开启视频笔记" style="display:flex;min-height:44px;max-width:240px;border-radius:999px;pointer-events:auto;">
              <span class="video-floating-prompt__hint">开启视频笔记 · Alt+V</span>
            </button>
            <button class="video-floating-prompt__close" aria-label="关闭视频笔记提示"></button>
          </div>
        \`;
        const videoSheet = new CSSStyleSheet();
        videoSheet.replaceSync('.z-\\\\[2147483645\\\\]{z-index:2147483645}.max-w-\\\\[240px\\\\]{max-width:240px}.group-focus-within\\\\:pointer-events-auto{pointer-events:auto}');
        shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, videoSheet];
      </script>
    `);
    const contract = await collectFloatingPromptContract(
      page.locator('[data-stitch-surface="video-floating-prompt"]').first()
    );
    expect(contract.legacyStyleBridgeCounts['panel-video-tailwind']).toBeGreaterThan(0);
  });
});
