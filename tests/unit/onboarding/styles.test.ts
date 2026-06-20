import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const onboardingCssPath = fileURLToPath(
  new URL('../../../src/options/stitch/styles/runtime/onboarding.css', import.meta.url)
);
const onboardingHtmlPath = fileURLToPath(
  new URL('../../../src/onboarding/index.html', import.meta.url)
);

function readCssRule(selector: string, property: string): string {
  const css = readFileSync(onboardingCssPath, 'utf8');
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const rules = Array.from(
    css.matchAll(new RegExp(`${escapedSelector}\\s*\\{(?<body>[^}]+)\\}`, 'gu'))
  );
  return rules.find((match) => match.groups?.body.includes(property))?.groups?.body ?? '';
}

describe('onboarding styles', () => {
  it('renders first-run privacy consent controls with the shared Options switch structure', () => {
    const html = readFileSync(onboardingHtmlPath, 'utf8');
    const consentSwitchRule = readCssRule(
      "body[data-route='onboarding'] .agreement-consent .switch",
      'flex: 0 0 auto'
    );
    const hintRule = readCssRule(
      "body[data-route='onboarding'] .agreement-consent-hint",
      'grid-column: 1 / -1'
    );

    expect(html).toContain('class="switch"');
    expect(html).toContain('class="slider"');
    expect(html).toContain('data-i18n="onboardingConsentSupportHint"');
    expect(html).not.toContain('<input type="checkbox" id="onboardingAnalyticsConsent" />');
    expect(html).not.toContain('<input type="checkbox" id="onboardingErrorReportingConsent" />');
    expect(consentSwitchRule).toContain('flex: 0 0 auto');
    expect(hintRule).toContain('grid-column: 1 / -1');
    expect(hintRule).toContain('color: var(--text-muted)');
  });

  it('keeps resource footer links sized to their labels without horizontal scrolling', () => {
    const footerLinkRule = readCssRule("body[data-route='onboarding'] .footer-link", 'width: auto');
    const footerLinksRule = readCssRule(
      "body[data-route='onboarding'] .footer-links",
      'overflow-x: visible'
    );

    expect(footerLinkRule).toContain('display: inline-flex');
    expect(footerLinkRule).toContain('width: auto');
    expect(footerLinkRule).toContain('flex: 0 0 auto');
    expect(footerLinksRule).toContain('flex-wrap: wrap');
    expect(footerLinksRule).toContain('max-width: 100%');
    expect(footerLinksRule).toContain('overflow-x: visible');
  });

  it('keeps first-run feature copy focused on shipped capabilities', () => {
    const html = readFileSync(onboardingHtmlPath, 'utf8');

    expect(html).toContain('data-i18n="step3Section3Detail5"');
    expect(html).toContain(
      'Save video screenshots with timestamps so Obsidian exports keep the visual context.'
    );
    expect(html).not.toContain('data-i18n="step5Detail1"');
    expect(html).not.toContain('Introducing AI features for smoother, more intelligent experience');
  });
});
