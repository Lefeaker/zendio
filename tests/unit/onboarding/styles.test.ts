import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const onboardingCssPath = fileURLToPath(
  new URL('../../../src/options/stitch/styles/runtime/onboarding.css', import.meta.url)
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
});
