import { expect, test } from '@playwright/test';
import {
  collectStitchContract,
  createPreviewUrl,
  createProductionUrl,
  expectNoLegacyOptionsShell,
  getPreviewSourceKind,
  type PreviewSourceKind,
  type StitchElementSample
} from './utils/stitchParityHarness';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 1200 },
  { name: 'tablet', width: 900, height: 1200 },
  { name: 'mobile', width: 390, height: 1200 }
] as const;

const THEMES = ['dark', 'light'] as const;

const DYNAMIC_CONTENT_SELECTORS = new Set(['body', '.app', '.content', '.panel-section', '.hero']);

const FOOTER_PANEL_IDS = [
  'clipper',
  'reader',
  'video',
  'video-floating-prompt',
  'task-success'
] as const;

const EXPECTED_RESOURCE_LABELS = [
  'Onboarding',
  'Plugin Setup',
  'Support',
  'Suggestions',
  'Contact',
  'Changelog'
] as const;

const EXPECTED_PRODUCTION_SURFACE_LABELS = [
  'Clipper Dialog',
  'Reader Mode',
  'Video Mode',
  'Video Floating Prompt',
  'Task Success'
] as const;

const DYNAMIC_WIDTH_SELECTORS = new Set([
  '.card',
  '.card-header',
  '.row',
  '.field',
  '.input',
  '.select',
  '.btn',
  '.switch',
  '.slider',
  '.table-wrap',
  '.notice'
]);

// Text-only copy drift between preview sources and production should not fail structural parity.
const DYNAMIC_HEIGHT_SELECTORS = new Set(['.main', '.sidebar', '.row']);

const EXPECTED_PREVIEW_SURFACE_LABELS: Record<PreviewSourceKind, string[]> = {
  'external-reference': ['Clipper Dialog', 'Reader Mode', 'Video Mode', 'Task Success'],
  'generated-preview': [
    'Clipper Dialog',
    'Reader Mode',
    'Video Mode',
    'Video Floating Prompt',
    'Task Success'
  ]
};

const EXPECTED_PREVIEW_SWITCH_LABELS: Record<PreviewSourceKind, string[]> = {
  'external-reference': [
    '保存页面时生成 AI 总结',
    '在阅读模式顶部显示页面总结',
    '启用视频字幕翻译'
  ],
  'generated-preview': []
};

const EXPECTED_PREVIEW_SURFACE_PANEL_COUNTS: Record<
  PreviewSourceKind,
  Record<(typeof FOOTER_PANEL_IDS)[number], number>
> = {
  'external-reference': {
    clipper: 1,
    reader: 1,
    video: 1,
    'video-floating-prompt': 0,
    'task-success': 1
  },
  'generated-preview': {
    clipper: 1,
    reader: 1,
    video: 1,
    'video-floating-prompt': 1,
    'task-success': 1
  }
};

const EXPECTED_PRODUCTION_SURFACE_PANEL_COUNTS: Record<(typeof FOOTER_PANEL_IDS)[number], number> =
  {
    clipper: 1,
    reader: 1,
    video: 1,
    'video-floating-prompt': 1,
    'task-success': 1
  };

function normalizeElementSamplesForParity(
  samples: Record<string, StitchElementSample>
): Record<string, StitchElementSample> {
  return Object.fromEntries(
    Object.entries(samples).map(([selector, sample]) => {
      if (!sample.exists) {
        return [selector, sample];
      }
      const rect = sample.rect
        ? {
            ...sample.rect,
            x: 0,
            y: 0
          }
        : undefined;
      const style = sample.style ? { ...sample.style } : undefined;
      if (style) {
        for (const key of ['height', 'width']) {
          const raw = style[key];
          if (typeof raw === 'string' && raw.endsWith('px')) {
            style[key] = `${Math.floor(Number.parseFloat(raw))}px`;
          }
        }
      }
      if (DYNAMIC_CONTENT_SELECTORS.has(selector)) {
        if (rect) {
          rect.width = 0;
          rect.height = 0;
        }
        if (style) {
          style.height = 'dynamic';
          style.width = 'dynamic';
        }
      }
      if (DYNAMIC_WIDTH_SELECTORS.has(selector)) {
        if (rect) {
          rect.width = 0;
        }
        if (style) {
          style.width = 'dynamic';
        }
      }
      if (DYNAMIC_HEIGHT_SELECTORS.has(selector)) {
        if (rect) {
          rect.height = 0;
        }
        if (style) {
          style.height = 'dynamic';
        }
      }
      return [
        selector,
        {
          ...sample,
          ...(rect ? { rect } : {}),
          ...(style ? { style } : {})
        }
      ];
    })
  );
}

function expectElementSamplesToMatch(
  production: Record<string, StitchElementSample>,
  preview: Record<string, StitchElementSample>
): void {
  const normalizedProduction = normalizeElementSamplesForParity(production);
  const normalizedPreview = normalizeElementSamplesForParity(preview);
  expect(Object.keys(normalizedProduction).sort()).toEqual(Object.keys(normalizedPreview).sort());

  for (const [selector, productionSample] of Object.entries(normalizedProduction)) {
    const previewSample = normalizedPreview[selector];
    expect(productionSample.exists, selector).toBe(previewSample?.exists);
    if (!productionSample.exists || !previewSample?.exists) {
      continue;
    }
    expect(productionSample.style, selector).toEqual(previewSample.style);
    if (!productionSample.rect || !previewSample.rect) {
      expect(productionSample.rect, selector).toEqual(previewSample.rect);
      continue;
    }
    expect(productionSample.rect.x, selector).toBe(previewSample.rect.x);
    expect(productionSample.rect.y, selector).toBe(previewSample.rect.y);
    expect(
      Math.abs(productionSample.rect.width - previewSample.rect.width),
      selector
    ).toBeLessThanOrEqual(1);
    expect(
      Math.abs(productionSample.rect.height - previewSample.rect.height),
      selector
    ).toBeLessThanOrEqual(1);
  }
}

async function stabilize(page: import('@playwright/test').Page): Promise<void> {
  await page.addStyleTag({
    content: `
      *, *::before, *::after {
        transition: none !important;
        animation: none !important;
        caret-color: transparent !important;
        scroll-behavior: auto !important;
      }
      .sidebar-footer-section:nth-of-type(2) {
        display: none !important;
      }
      .brand-mark img {
        visibility: hidden !important;
      }
      .brand-copy span {
        display: none !important;
      }
      .table-wrap {
        height: 316px !important;
        overflow: hidden !important;
      }
      .table-wrap table {
        visibility: hidden !important;
      }
    `
  });
  await page.evaluate(async () => {
    if ('fonts' in document) {
      await document.fonts.ready;
    }
  });
}

async function setLanguage(page: import('@playwright/test').Page, value: string): Promise<void> {
  const language = page
    .locator('.field:has-text("界面语言") select, .field:has-text("Language") select')
    .first();
  if (await language.count()) {
    await language.selectOption(value);
    await page.waitForTimeout(100);
  }
}

async function setTheme(
  page: import('@playwright/test').Page,
  value: 'dark' | 'light'
): Promise<void> {
  const themeButton = page
    .locator(
      `.field:has-text("界面主题") .chips button[data-value="${value}"], .field:has-text("Interface Theme") .chips button[data-value="${value}"]`
    )
    .first();
  await themeButton.click();
  await expect
    .poll(() =>
      page
        .locator('html')
        .evaluate(
          (node) => node.getAttribute('data-preview-theme') ?? node.getAttribute('data-theme')
        )
    )
    .toBe(value);
}

async function exposeYamlDomainEditor(page: import('@playwright/test').Page): Promise<void> {
  const addRule = page.locator('.stitch-yaml-actions button:has-text("+ Add domain rule")').first();
  if (await addRule.count()) {
    await addRule.click();
  }
}

async function expectFooterPanelCounts(
  page: import('@playwright/test').Page,
  expectedCounts: Record<(typeof FOOTER_PANEL_IDS)[number], number>
): Promise<void> {
  for (const panelId of FOOTER_PANEL_IDS) {
    await expect(page.locator(`[data-footer-panel="${panelId}"]`), panelId).toHaveCount(
      expectedCounts[panelId]
    );
  }
}

async function prepareOptionsPage(
  page: import('@playwright/test').Page,
  url: string,
  theme: 'dark' | 'light'
): Promise<void> {
  await page.goto(url);
  await page.waitForSelector('.app');
  await setLanguage(page, 'en');
  await setTheme(page, theme);
  await exposeYamlDomainEditor(page);
  await stabilize(page);
}

function expectSharedOptionsParity(
  production: Awaited<ReturnType<typeof collectStitchContract>>,
  preview: Awaited<ReturnType<typeof collectStitchContract>>,
  theme: 'dark' | 'light',
  previewSourceKind: PreviewSourceKind
): void {
  const previewReleaseNavLabels = preview.navLabels.filter((label) => label !== 'Experimental');
  const expectedPreviewModalTitles = [
    ...EXPECTED_RESOURCE_LABELS,
    ...EXPECTED_PREVIEW_SURFACE_LABELS[previewSourceKind]
  ];
  const expectedProductionModalTitles = [
    ...EXPECTED_RESOURCE_LABELS,
    ...EXPECTED_PRODUCTION_SURFACE_LABELS
  ];
  expect(production.skin.previewSkin).toBe('stitch-secondary');
  expect(production.skin.previewTheme).toBe(theme);
  expect(preview.skin.previewSkin).toBeNull();
  expect(production.skin.previewTheme).toBe(preview.skin.previewTheme);
  expect(production.computed.body).toEqual(preview.computed.body);
  expect(production.computed.main).toEqual(preview.computed.main);
  expect(production.computed.heroTitle).toEqual(preview.computed.heroTitle);
  expect(production.computed.card).toEqual(preview.computed.card);
  expect(production.computed.button).toEqual(preview.computed.button);
  expectElementSamplesToMatch(production.elementSamples, preview.elementSamples);
  expect(production.navLabels).toEqual(previewReleaseNavLabels);
  expect(production.resourceLabels).toEqual(EXPECTED_RESOURCE_LABELS);
  expect(preview.resourceLabels).toEqual(EXPECTED_RESOURCE_LABELS);
  expect(production.surfaceLabels).toEqual(EXPECTED_PRODUCTION_SURFACE_LABELS);
  expect(preview.surfaceLabels).toEqual(EXPECTED_PREVIEW_SURFACE_LABELS[previewSourceKind]);
  expect(production.modalResourceTitles).toEqual(expectedProductionModalTitles);
  expect(preview.modalResourceTitles).toEqual(expectedPreviewModalTitles);
  expect(production.activePanel).toBeTruthy();
  expect(preview.activePanel).toBeTruthy();
  expect(production.hasInlineThemeSegmentedControl).toBe(true);
  expect(production.aiPlatformLinkTexts.length).toBeGreaterThanOrEqual(
    preview.aiPlatformLinkTexts.length
  );
  if (preview.deepResearchNoticeText) {
    expect(production.deepResearchNoticeText).toBe(preview.deepResearchNoticeText);
  }
  expect(production.panelSectionCount).toBeGreaterThanOrEqual(preview.panelSectionCount - 1);
  expect(preview.yamlWidget.hasLegacyView).toBe(false);
  expect(preview.yamlWidget.hasMissingWidget).toBe(false);
  if (previewSourceKind === 'external-reference') {
    expect(preview.yamlWidget.hasNativeTable).toBe(false);
  } else {
    expect(preview.yamlWidget).toMatchObject({
      hasNativeTable: true,
      disabledActionCount: 0,
      actionLabels: expect.arrayContaining(['+ Add field', '+ Add domain rule'])
    });
    expect(preview.yamlWidget.defaultValueInputCount).toBeGreaterThan(0);
    expect(preview.yamlWidget.valuePathInputCount).toBeGreaterThan(0);
    expect(preview.yamlWidget.domainDefaultValueInputCount).toBeGreaterThan(0);
    expect(preview.yamlWidget.domainValuePathInputCount).toBeGreaterThan(0);
  }
  expect(production.yamlWidget).toMatchObject({
    hasNativeTable: true,
    hasLegacyView: false,
    hasMissingWidget: false,
    disabledActionCount: 0,
    actionLabels: expect.arrayContaining(['+ Add field', '+ Add domain rule'])
  });
  expect(production.yamlWidget.hostCount).toBeGreaterThan(0);
  expect(production.yamlWidget.defaultValueInputCount).toBeGreaterThan(0);
  expect(production.yamlWidget.valuePathInputCount).toBeGreaterThan(0);
  expect(production.yamlWidget.domainDefaultValueInputCount).toBeGreaterThan(0);
  expect(production.yamlWidget.domainValuePathInputCount).toBeGreaterThan(0);
  expect(production.yamlWidget.checkedToggleCount).toBeGreaterThan(0);
  expect(production.classSlotPresence).toMatchObject({
    app: true,
    sidebar: true,
    main: true,
    card: true,
    aiPlatformLink: true
  });
}

test.describe('Stitch Secondary preview-to-production parity', () => {
  for (const viewport of VIEWPORTS) {
    for (const theme of THEMES) {
      test(`production matches preview structural contract at ${viewport.name} ${theme}`, async ({
        page
      }) => {
        const previewUrl = createPreviewUrl();
        const productionUrl = createProductionUrl();
        await page.setViewportSize({ width: viewport.width, height: viewport.height });

        await prepareOptionsPage(page, previewUrl, theme);
        await expectFooterPanelCounts(
          page,
          EXPECTED_PREVIEW_SURFACE_PANEL_COUNTS[getPreviewSourceKind()]
        );
        const preview = await collectStitchContract(page);

        await prepareOptionsPage(page, productionUrl, theme);
        await expectNoLegacyOptionsShell(page);
        await expectFooterPanelCounts(page, EXPECTED_PRODUCTION_SURFACE_PANEL_COUNTS);
        await expect(page.locator('[data-stitch-surface="clipper"]')).toHaveCount(0);
        await expect(page.locator('[data-stitch-surface="reader"]')).toHaveCount(0);
        await expect(page.locator('[data-stitch-surface="video"]')).toHaveCount(0);
        await expect(page.locator('[data-stitch-surface="video-floating-prompt"]')).toHaveCount(0);
        await expect(page.locator('[data-stitch-surface="task-success"]')).toHaveCount(0);
        const production = await collectStitchContract(page);

        expectSharedOptionsParity(production, preview, theme, getPreviewSourceKind());
      });
    }
  }

  test('production keeps the canonical desktop snapshot', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'chromium-desktop',
      'Canonical desktop snapshot is covered by the desktop project.'
    );
    const previewUrl = createPreviewUrl();
    const productionUrl = createProductionUrl();

    await page.setViewportSize({ width: 1280, height: 720 });
    await prepareOptionsPage(page, previewUrl, 'dark');
    await expectFooterPanelCounts(
      page,
      EXPECTED_PREVIEW_SURFACE_PANEL_COUNTS[getPreviewSourceKind()]
    );
    const preview = await collectStitchContract(page);

    await prepareOptionsPage(page, productionUrl, 'dark');
    await expectNoLegacyOptionsShell(page);
    await expectFooterPanelCounts(page, EXPECTED_PRODUCTION_SURFACE_PANEL_COUNTS);
    const production = await collectStitchContract(page);
    expectSharedOptionsParity(production, preview, 'dark', getPreviewSourceKind());

    await page.screenshot({
      path: testInfo.outputPath('options-stitch-secondary-production-desktop.png'),
      fullPage: true
    });
  });

  test('preview interaction inventory has production handlers and no fake YAML summary controls', async ({
    page
  }) => {
    const previewUrl = createPreviewUrl();
    const productionUrl = createProductionUrl();

    await page.goto(previewUrl);
    await page.waitForSelector('.app');
    await setLanguage(page, 'en');
    await exposeYamlDomainEditor(page);
    await stabilize(page);
    const preview = await collectStitchContract(page);

    await page.goto(productionUrl);
    await page.waitForSelector('.app');
    await setLanguage(page, 'en');
    await exposeYamlDomainEditor(page);
    await stabilize(page);
    await expectNoLegacyOptionsShell(page);
    await expectFooterPanelCounts(page, EXPECTED_PRODUCTION_SURFACE_PANEL_COUNTS);
    const production = await collectStitchContract(page);

    for (const label of ['Privacy policy', 'Data usage details']) {
      expect(production.interactionInventory.enabledButtonLabels).toContain(label);
    }
    for (const label of EXPECTED_PRODUCTION_SURFACE_LABELS) {
      expect(production.interactionInventory.enabledButtonLabels).toContain(label);
    }
    for (const label of ['Apply Minimal', 'Apply Research', 'Apply Conversation']) {
      expect(production.interactionInventory.enabledButtonLabels).not.toContain(label);
      expect(production.interactionInventory.disabledButtonLabels).not.toContain(label);
    }
    for (const label of [
      'Privacy policy',
      'Data usage details',
      '+ Add field',
      '+ Add domain rule'
    ]) {
      expect(production.interactionInventory.disabledButtonLabels).not.toContain(label);
      expect(preview.interactionInventory.disabledButtonLabels).not.toContain(label);
    }
    for (const label of ['隐私政策', '数据用途说明']) {
      expect(production.interactionInventory.enabledButtonLabels).not.toContain(label);
    }

    expect(production.yamlWidget.actionLabels).toEqual(
      expect.arrayContaining(['+ Add field', '+ Add domain rule'])
    );
    expect(production.yamlWidget.defaultValueInputCount).toBeGreaterThan(0);
    expect(production.yamlWidget.valuePathInputCount).toBeGreaterThan(0);
    expect(production.yamlWidget.domainDefaultValueInputCount).toBeGreaterThan(0);
    expect(production.yamlWidget.domainValuePathInputCount).toBeGreaterThan(0);

    expect(production.navLabels).not.toContain('Experimental');
    expect(production.interactionInventory.switchLabels.map((item) => item.label)).not.toEqual(
      expect.arrayContaining([
        '保存页面时生成 AI 总结',
        '在阅读模式顶部显示页面总结',
        '启用视频字幕翻译'
      ])
    );
    const previewSwitchLabels = preview.interactionInventory.switchLabels.map((item) => item.label);
    for (const label of EXPECTED_PREVIEW_SWITCH_LABELS[getPreviewSourceKind()]) {
      expect(previewSwitchLabels.some((entry) => entry.includes(label))).toBe(true);
    }
  });
});
