import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const onboardingCssPath = fileURLToPath(
  new URL('../../../src/options/stitch/styles/runtime/onboarding.css', import.meta.url)
);

function readFooterLinksRule(): string {
  const css = readFileSync(onboardingCssPath, 'utf8');
  const footerRules = Array.from(css.matchAll(/\.footer-links\s*\{(?<body>[^}]+)\}/gu));
  return (
    footerRules.find((match) => match.groups?.body.includes('flex-wrap: nowrap'))?.groups?.body ??
    ''
  );
}

describe('onboarding styles', () => {
  it('keeps the resource footer links in one row without widening the page', () => {
    const footerLinksRule = readFooterLinksRule();

    expect(footerLinksRule).toContain('flex-wrap: nowrap');
    expect(footerLinksRule).toContain('max-width: 100%');
    expect(footerLinksRule).toContain('overflow-x: auto');
  });
});
