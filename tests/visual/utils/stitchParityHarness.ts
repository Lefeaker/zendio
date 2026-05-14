import { expect, type Page } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

export interface StitchElementSample {
  exists: boolean;
  rect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  style?: Record<string, string>;
}

export interface StitchParityContract {
  skin: {
    previewSkin: string | null;
    previewTheme: string | null;
    theme: string | null;
  };
  computed: {
    body: Record<string, string>;
    main: Record<string, string>;
    heroTitle: Record<string, string>;
    card: Record<string, string>;
    button: Record<string, string>;
  };
  navLabels: string[];
  resourceLabels: string[];
  surfaceLabels: string[];
  activePanel: string | null;
  hasInlineThemeSegmentedControl: boolean;
  aiPlatformLinkTexts: string[];
  deepResearchNoticeText: string;
  modalResourceTitles: string[];
  panelSectionCount: number;
  classSlotPresence: Record<string, boolean>;
  yamlWidget: {
    hostCount: number;
    hasNativeTable: boolean;
    hasLegacyView: boolean;
    hasMissingWidget: boolean;
    actionLabels: string[];
    checkedToggleCount: number;
    disabledActionCount: number;
    rowCount: number;
    domainRuleCount: number;
    defaultValueInputCount: number;
    valuePathInputCount: number;
    domainDefaultValueInputCount: number;
    domainValuePathInputCount: number;
  };
  interactionInventory: {
    enabledButtonLabels: string[];
    disabledButtonLabels: string[];
    switchLabels: Array<{ label: string; disabled: boolean }>;
    selectLabels: string[];
    inputCount: number;
    selectCount: number;
  };
  elementSamples: Record<string, StitchElementSample>;
}

const EXTERNAL_PREVIEW_ENTRY = 'future/options-component-preview 2/index.html';
const GENERATED_PREVIEW_ROOT = resolve(
  process.cwd(),
  '..',
  '.tmp/stitch-parity-preview/options-component-preview'
);
let generatedPreviewBuilt = false;

function findExternalPreviewEntry(startDir: string): string | null {
  let current = startDir;
  for (;;) {
    const candidate = join(current, EXTERNAL_PREVIEW_ENTRY);
    if (existsSync(candidate)) {
      return candidate;
    }
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function buildGeneratedPreviewEntry(): string {
  if (!generatedPreviewBuilt) {
    execFileSync(
      process.execPath,
      [resolve(process.cwd(), 'scripts/build-preview.mjs'), '--outdir', GENERATED_PREVIEW_ROOT],
      {
        cwd: process.cwd(),
        stdio: 'inherit'
      }
    );
    generatedPreviewBuilt = true;
  }

  return join(GENERATED_PREVIEW_ROOT, 'index.html');
}

function resolvePreviewEntry(): string {
  return findExternalPreviewEntry(process.cwd()) ?? buildGeneratedPreviewEntry();
}

export function createPreviewUrl(): string {
  return pathToFileURL(resolvePreviewEntry()).toString();
}

export function createProductionUrl(): string {
  const port = process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? '4181';
  return `http://127.0.0.1:${port}/options/index.html`;
}

export async function collectStitchContract(page: Page): Promise<StitchParityContract> {
  return page.evaluate(() => {
    const texts = (selector: string): string[] =>
      Array.from(document.querySelectorAll(selector))
        .map((node) => node.textContent?.trim() ?? '')
        .filter(Boolean);
    const unique = (values: string[]): string[] => Array.from(new Set(values)).sort();
    const controlLabel = (node: HTMLElement): string =>
      node.textContent?.replace(/\s+/g, ' ').trim() ||
      node.getAttribute('aria-label') ||
      node.getAttribute('placeholder') ||
      node.getAttribute('data-template-field') ||
      node.getAttribute('data-yaml-field') ||
      node.getAttribute('data-yaml-domain') ||
      node.getAttribute('data-yaml-domain-field') ||
      node.getAttribute('name') ||
      '';
    const fieldLabel = (node: HTMLElement): string =>
      node.closest('.field')?.querySelector('label')?.textContent?.replace(/\s+/g, ' ').trim() ||
      node.closest('.row')?.textContent?.replace(/\s+/g, ' ').trim() ||
      node
        .closest('.summary-toggle-item, .subtitle-inline-item, .consent-inline-item')
        ?.querySelector('strong')
        ?.textContent?.trim() ||
      controlLabel(node);
    const styleSnapshot = (selector: string): Record<string, string> => {
      const node = document.querySelector<HTMLElement>(selector);
      if (!node) {
        return {};
      }
      const style = window.getComputedStyle(node);
      return {
        backgroundColor: style.backgroundColor,
        padding: style.padding,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        color: style.color,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        minHeight: style.minHeight
      };
    };
    const sampleSelectors = [
      'body',
      '.app',
      '.sidebar',
      '.main',
      '.content',
      '.panel-section',
      '.hero',
      '.hero h1',
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
      '.notice',
      '.resource-modal',
      '.resource-modal-overlay'
    ];
    const sampleElement = (selector: string): StitchElementSample => {
      const node = document.querySelector<HTMLElement>(selector);
      if (!node) {
        return { exists: false };
      }
      const rect = node.getBoundingClientRect();
      const style = window.getComputedStyle(node);
      return {
        exists: true,
        rect: {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height)
        },
        style: {
          display: style.display,
          position: style.position,
          padding: style.padding,
          margin: style.margin,
          gap: style.gap,
          minHeight: style.minHeight,
          height: style.height,
          width: style.width,
          borderRadius: style.borderRadius,
          backgroundColor: style.backgroundColor,
          color: style.color,
          fontSize: style.fontSize,
          fontWeight: style.fontWeight,
          lineHeight: style.lineHeight,
          boxShadow: style.boxShadow,
          boxSizing: style.boxSizing
        }
      };
    };
    const elementSamples = Object.fromEntries(
      sampleSelectors.map((selector) => [selector, sampleElement(selector)])
    );

    const activePanel =
      document.querySelector<HTMLElement>('[data-nav-panel].is-active')?.dataset.navPanel ??
      document.querySelector<HTMLElement>('[data-panel-id]')?.dataset.panelId ??
      null;

    const modalResourceTitles: string[] = [];
    document.querySelectorAll<HTMLElement>('[data-footer-panel]').forEach((button) => {
      const label = button.textContent?.trim();
      if (label) {
        modalResourceTitles.push(label);
      }
    });

    const footerSections = Array.from(
      document.querySelectorAll<HTMLElement>('.sidebar-footer-section')
    );
    const footerPanelTexts = (section: HTMLElement | undefined): string[] =>
      section
        ? Array.from(section.querySelectorAll('[data-footer-panel]'))
            .map((node) => node.textContent?.trim() ?? '')
            .filter(Boolean)
        : [];

    return {
      skin: {
        previewSkin: document.documentElement.getAttribute('data-preview-skin'),
        previewTheme: document.documentElement.getAttribute('data-preview-theme'),
        theme: document.documentElement.getAttribute('data-theme')
      },
      computed: {
        body: styleSnapshot('body'),
        main: styleSnapshot('.main'),
        heroTitle: styleSnapshot('.hero h1'),
        card: styleSnapshot('.card'),
        button: styleSnapshot('.btn')
      },
      navLabels: texts('[data-nav-panel] strong'),
      resourceLabels: footerPanelTexts(footerSections[0]),
      surfaceLabels: footerPanelTexts(footerSections[1]),
      activePanel,
      hasInlineThemeSegmentedControl: Boolean(
        Array.from(document.querySelectorAll('.field'))
          .find(
            (field) =>
              field.textContent?.includes('界面主题') ||
              field.textContent?.includes('Interface Theme')
          )
          ?.querySelector('.chips button[data-value="dark"]')
      ),
      aiPlatformLinkTexts: texts('.ai-platform-link'),
      deepResearchNoticeText:
        document.querySelector('.purify-mode-notice')?.textContent?.replace(/\s+/g, ' ').trim() ??
        '',
      modalResourceTitles,
      panelSectionCount: document.querySelectorAll('[data-panel-id]').length,
      classSlotPresence: {
        app: Boolean(document.querySelector('.app')),
        sidebar: Boolean(document.querySelector('.sidebar')),
        main: Boolean(document.querySelector('.main')),
        card: Boolean(document.querySelector('.card')),
        resourceModalOverlay: Boolean(document.querySelector('.resource-modal-overlay')),
        aiPlatformLink: Boolean(document.querySelector('.ai-platform-link'))
      },
      yamlWidget: {
        hostCount: document.querySelectorAll('[data-stitch-widget="yaml-config"]').length,
        hasNativeTable: Boolean(document.querySelector('.stitch-yaml-config-table')),
        hasLegacyView: Array.from(
          document.querySelectorAll<HTMLElement>('[data-stitch-widget="yaml-config"]')
        ).some((host) =>
          Boolean(host.querySelector('[data-role="yaml-config-view"], [class*="aobx-"]'))
        ),
        hasMissingWidget: Boolean(document.querySelector('.schema-widget-missing')),
        actionLabels: texts('.stitch-yaml-actions button'),
        checkedToggleCount: document.querySelectorAll(
          '.stitch-yaml-config-table input[type="checkbox"]:checked'
        ).length,
        disabledActionCount: document.querySelectorAll('.stitch-yaml-actions button:disabled')
          .length,
        rowCount: document.querySelectorAll('.stitch-yaml-config-table tbody tr').length,
        domainRuleCount: document.querySelectorAll('.stitch-yaml-domain-rule').length,
        defaultValueInputCount: document.querySelectorAll(
          '.stitch-yaml-config-table input[data-yaml-field="defaultValue"]'
        ).length,
        valuePathInputCount: document.querySelectorAll(
          '.stitch-yaml-config-table input[data-yaml-field="valuePath"]'
        ).length,
        domainDefaultValueInputCount: document.querySelectorAll(
          '.stitch-yaml-domain-rule input[data-yaml-domain-field="defaultValue"]'
        ).length,
        domainValuePathInputCount: document.querySelectorAll(
          '.stitch-yaml-domain-rule input[data-yaml-domain-field="valuePath"]'
        ).length
      },
      interactionInventory: {
        enabledButtonLabels: unique(
          Array.from(document.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'))
            .map(controlLabel)
            .filter(Boolean)
        ),
        disabledButtonLabels: unique(
          Array.from(document.querySelectorAll<HTMLButtonElement>('button:disabled'))
            .map(controlLabel)
            .filter(Boolean)
        ),
        switchLabels: Array.from(
          document.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')
        )
          .map((input) => ({ label: fieldLabel(input), disabled: input.disabled }))
          .filter((item) => Boolean(item.label))
          .sort((a, b) => a.label.localeCompare(b.label)),
        selectLabels: unique(
          Array.from(document.querySelectorAll<HTMLSelectElement>('select'))
            .map(fieldLabel)
            .filter(Boolean)
        ),
        inputCount: document.querySelectorAll('input:not([type="hidden"])').length,
        selectCount: document.querySelectorAll('select').length
      },
      elementSamples
    };
  });
}

export async function expectNoLegacyOptionsShell(page: Page): Promise<void> {
  await expect(page.locator('#theme-switcher')).toHaveCount(0);
  await expect(
    page.locator('#supportModal, #suggestionsModal, #contactModal, #changelogModal')
  ).toHaveCount(0);
  await expect(page.locator('.aobx-shell__sidebar')).toHaveCount(0);
  await expect(
    page.locator('details:has(.ai-platform-link), details:has-text("ChatGPT")')
  ).toHaveCount(0);
}
