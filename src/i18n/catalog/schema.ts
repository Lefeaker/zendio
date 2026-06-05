import type { LangCode } from './languages';
import { PSEUDO_LOCALE_CODE, isReleaseLanguage } from './languages';
import type { RuntimeMessageKey } from './keys';
import { isRuntimeMessageKey } from './keys';
import type { CatalogDomainName } from './domains';
import { isCatalogDomain } from './domains';
import type { ChromeStaticCatalog } from './static';
import { isChromeStaticKey } from './static';

export type CatalogRuntimeMessages = Partial<Record<RuntimeMessageKey, string>>;
export type CatalogDomainGroups = Partial<Record<CatalogDomainName, RuntimeMessageKey[]>>;

export interface CatalogLocaleCatalog {
  language: LangCode;
  runtime: CatalogRuntimeMessages;
  static?: Partial<ChromeStaticCatalog>;
  domains?: CatalogDomainGroups;
}

export type CatalogSchema = CatalogLocaleCatalog;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord<Key extends string>(
  value: unknown,
  keyGuard: (key: string) => key is Key
): value is Partial<Record<Key, string>> {
  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).every(
    ([key, entryValue]) => keyGuard(key) && typeof entryValue === 'string'
  );
}

function isCatalogLanguageCode(value: unknown): value is LangCode {
  return typeof value === 'string' && (value === PSEUDO_LOCALE_CODE || isReleaseLanguage(value));
}

export function isCatalogDomainGroups(value: unknown): value is CatalogDomainGroups {
  if (!isRecord(value)) {
    return false;
  }

  return Object.entries(value).every(
    ([key, entryValue]) =>
      isCatalogDomain(key) &&
      Array.isArray(entryValue) &&
      entryValue.every((item) => typeof item === 'string' && isRuntimeMessageKey(item))
  );
}

export function isCatalogLocaleCatalog(value: unknown): value is CatalogLocaleCatalog {
  if (!isRecord(value)) {
    return false;
  }

  if (!isCatalogLanguageCode(value.language)) {
    return false;
  }

  if (!isStringRecord(value.runtime, isRuntimeMessageKey)) {
    return false;
  }

  if (value.static !== undefined && !isStringRecord(value.static, isChromeStaticKey)) {
    return false;
  }

  if (value.domains !== undefined && !isCatalogDomainGroups(value.domains)) {
    return false;
  }

  return true;
}

export function isCatalogSchema(value: unknown): value is CatalogSchema {
  return isCatalogLocaleCatalog(value);
}
