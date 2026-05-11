import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';

export interface RuntimeSurfaceContract {
  rootClasses: string[];
  schemaSelectorCounts: Record<string, number>;
  legacySelectorCounts: Record<string, number>;
  legacyStyleBridgeCounts: Record<string, number>;
  buttonActionLabels: string[];
  buttonActionIds: string[];
  linkHrefs: string[];
  computed: {
    overlay: Record<string, string>;
    modal: Record<string, string>;
    surfaceWindow: Record<string, string>;
    primaryButton: Record<string, string>;
    input: Record<string, string>;
    body: Record<string, string>;
    header: Record<string, string>;
  };
  cssVariables: Record<string, string>;
  rects: {
    overlay: Record<string, number>;
    modal: Record<string, number>;
  };
}

const SCHEMA_SELECTORS = [
  '.resource-modal-stack',
  '.surface-window',
  '.surface-window-header, .clipper-header, .task-success-header',
  '.surface-window-body, .clipper-body, .task-success-body'
];

const LEGACY_SELECTORS = [
  '.clipper-dialog-shell',
  '.reader-dialog-content',
  '.video-dialog-content',
  '[data-role="support-link"]'
];

export const LEGACY_STYLE_BRIDGES = [
  'clipper-tailwind',
  'panel-clipper-tailwind',
  'panel-video-tailwind'
];

export const LEGACY_STYLE_BRIDGE_SIGNATURES: Record<string, string[]> = {
  'clipper-tailwind': ['.clipper-card', '.modal-box'],
  'panel-clipper-tailwind': ['.clipper-card', '.modal-box'],
  'panel-video-tailwind': [
    '.z-\\[2147483645\\]',
    '.max-w-\\[240px\\]',
    '.group-focus-within\\:pointer-events-auto'
  ]
};

export async function collectLegacyStyleBridgeCounts(
  root: Locator
): Promise<Record<string, number>> {
  return root.evaluate(
    (node, bridgeData) => {
      const { bridgeKeys, signaturesByKey } = bridgeData;
      const rootNode = node.getRootNode();
      const scope: ParentNode = rootNode instanceof ShadowRoot ? rootNode : document;
      const adoptedStyleTexts =
        rootNode instanceof ShadowRoot
          ? rootNode.adoptedStyleSheets.map((sheet) => {
              try {
                return Array.from(sheet.cssRules)
                  .map((rule) => rule.cssText)
                  .join('\n');
              } catch {
                return '';
              }
            })
          : [];
      return Object.fromEntries(
        bridgeKeys.map((key) => [
          key,
          scope.querySelectorAll(`style[data-aiob-style-bridge="${key}"]`).length +
            adoptedStyleTexts.filter((cssText) =>
              (signaturesByKey[key] ?? []).some((signature) => cssText.includes(signature))
            ).length
        ])
      );
    },
    {
      bridgeKeys: LEGACY_STYLE_BRIDGES,
      signaturesByKey: LEGACY_STYLE_BRIDGE_SIGNATURES
    }
  );
}

export async function collectRuntimeSurfaceContract(
  root: Locator
): Promise<RuntimeSurfaceContract> {
  const countSelectors = async (selectors: string[]): Promise<Record<string, number>> => {
    const entries = await Promise.all(
      selectors.map(async (selector) => [selector, await root.locator(selector).count()] as const)
    );
    return Object.fromEntries(entries);
  };
  const actionButtons = root.locator('button');
  const actionIdButtons = root.locator('button[data-action-id]');
  const supportLinks = root.locator('a.task-support-link[href]');
  const surfaceWindow = root.locator('.surface-window').first();
  const modal = root.locator('.resource-modal').first();
  const primaryButton = root.locator('.btn.primary').first();
  const input = root
    .locator('.input, .textarea, [data-highlight-input], [data-capture-input]')
    .first();
  const body = root.locator('.surface-window-body, .clipper-body, .task-success-body').first();
  const header = root
    .locator('.surface-window-header, .clipper-header, .task-success-header')
    .first();
  await expect(surfaceWindow).toBeVisible({ timeout: 10000 });
  await expect(header).toBeVisible({ timeout: 10000 });
  await expect(body).toBeVisible({ timeout: 10000 });
  const readComputed = async (node: Locator, keys: string[]): Promise<Record<string, string>> => {
    if ((await node.count()) === 0) {
      return {};
    }
    await node.evaluate((element) => {
      if (element instanceof HTMLElement) {
        element.blur();
      }
    });
    const evaluateComputed = (): Promise<Record<string, string>> =>
      node.evaluate((element, styleKeys) => {
        const style = window.getComputedStyle(element);
        return Object.fromEntries(styleKeys.map((key) => [key, style.getPropertyValue(key)]));
      }, keys);
    await expect
      .poll(async () => {
        const computed = await evaluateComputed();
        return keys.every((key) => (computed[key] ?? '') !== '');
      })
      .toBe(true);
    return evaluateComputed();
  };
  const readRect = async (node: Locator): Promise<Record<string, number>> => {
    if ((await node.count()) === 0) {
      return {};
    }
    return node.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        width: Math.round(rect.width),
        height: Math.round(rect.height)
      };
    });
  };
  return {
    rootClasses: await root.evaluate((node) => Array.from(node.classList)),
    schemaSelectorCounts: await countSelectors(SCHEMA_SELECTORS),
    legacySelectorCounts: await countSelectors(LEGACY_SELECTORS),
    legacyStyleBridgeCounts: await collectLegacyStyleBridgeCounts(root),
    buttonActionLabels: (await actionButtons.allTextContents())
      .map((text) => text.replace(/\s+/g, ' ').trim())
      .filter(Boolean),
    buttonActionIds: await actionIdButtons.evaluateAll((buttons) =>
      buttons.map((button) => button.getAttribute('data-action-id') ?? '').filter(Boolean)
    ),
    linkHrefs: await supportLinks.evaluateAll((links) =>
      links.map((link) => (link instanceof HTMLAnchorElement ? link.href : '')).filter(Boolean)
    ),
    computed: {
      overlay: await readComputed(root, [
        'position',
        'z-index',
        'inset',
        'transform',
        'display',
        'align-items',
        'justify-content',
        'padding',
        'background-color',
        'pointer-events'
      ]),
      modal: await readComputed(modal, [
        'position',
        'left',
        'top',
        'margin',
        'transform',
        'width',
        'max-height',
        'background-color',
        'border-top-width',
        'box-shadow',
        'overflow'
      ]),
      surfaceWindow: await surfaceWindow.evaluate((node) => {
        const style = window.getComputedStyle(node);
        return {
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          boxShadow: style.boxShadow,
          color: style.color
        };
      }),
      primaryButton: await primaryButton.evaluate((node) => {
        const style = window.getComputedStyle(node);
        return {
          backgroundColor: style.backgroundColor,
          color: style.color,
          borderColor: style.borderColor,
          borderRadius: style.borderRadius,
          minHeight: style.minHeight
        };
      }),
      input: await readComputed(input, [
        'background-color',
        'border-color',
        'border-radius',
        'color'
      ]),
      body: await readComputed(body, ['background-color', 'padding', 'gap']),
      header: await readComputed(header, ['background-color', 'border-bottom-color', 'padding'])
    },
    cssVariables: await surfaceWindow.evaluate((node) => {
      const style = window.getComputedStyle(node);
      return {
        runtimePanel: style.getPropertyValue('--runtime-panel').trim(),
        runtimeLine: style.getPropertyValue('--runtime-line').trim(),
        accent: style.getPropertyValue('--accent').trim()
      };
    }),
    rects: {
      overlay: await readRect(root),
      modal: await readRect(modal)
    }
  };
}

export function expectSchemaContract(contract: RuntimeSurfaceContract): void {
  for (const count of Object.values(contract.schemaSelectorCounts)) {
    expect(count).toBeGreaterThan(0);
  }
  expect(contract.legacySelectorCounts).toEqual(
    Object.fromEntries(LEGACY_SELECTORS.map((selector) => [selector, 0]))
  );
  expect(contract.buttonActionLabels.length + contract.linkHrefs.length).toBeGreaterThan(0);
  expect(contract.cssVariables.runtimePanel).not.toBe('');
  expect(contract.cssVariables.runtimeLine).not.toBe('');
  expect(contract.cssVariables.accent).not.toBe('');
  expect(contract.computed.surfaceWindow.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
}

export async function saveRuntimeScreenshot(
  page: Page,
  testInfo: TestInfo,
  name: string
): Promise<void> {
  await page.screenshot({
    path: testInfo.outputPath(`${name}.png`),
    fullPage: true
  });
}
