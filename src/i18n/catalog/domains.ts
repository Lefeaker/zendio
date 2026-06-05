export const CATALOG_DOMAIN_NAMES = [
  'common',
  'clipper',
  'reader',
  'video',
  'options',
  'onboarding',
  'diagnostics',
  'privacy',
  'usage',
  'schema',
  'support',
  'dynamic',
  'extension'
] as const;

export type CatalogDomainName = (typeof CATALOG_DOMAIN_NAMES)[number];

const CATALOG_DOMAIN_SET = new Set<string>(CATALOG_DOMAIN_NAMES);

export function isCatalogDomain(value: string): value is CatalogDomainName {
  return CATALOG_DOMAIN_SET.has(value);
}
