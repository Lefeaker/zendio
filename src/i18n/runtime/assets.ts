import type { ReleaseLangCode } from '../catalog/languages';
import type { GeneratedSchemaMessages } from '../generated/schemaCore.generated';
import type { LocaleDefinition } from '../localeDefinition';

export type RuntimeAssetUrlResolver = (path: string) => string;

type JsonValue = string | number | boolean | null | JsonValue[] | JsonRecord;

interface JsonRecord {
  [key: string]: JsonValue;
}

function isRecord(value: JsonValue): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStringRecord(value: object): value is Record<string, string> {
  return Object.values(value).every((item) => typeof item === 'string');
}

function isRuntimeMessagesAsset(value: object): value is LocaleDefinition['runtime'] {
  return isStringRecord(value);
}

function isSchemaMessagesAsset(value: object): value is GeneratedSchemaMessages {
  return isStringRecord(value);
}

function readLocaleDefinitionAsset(value: JsonValue, language: ReleaseLangCode): LocaleDefinition {
  if (
    !isRecord(value) ||
    !isRecord(value.runtime) ||
    !isRuntimeMessagesAsset(value.runtime) ||
    !isRecord(value.static) ||
    typeof value.static.extName !== 'string' ||
    typeof value.static.extDescription !== 'string'
  ) {
    throw new Error(`Invalid i18n locale asset for ${language}.`);
  }

  return {
    runtime: value.runtime,
    static: {
      extName: value.static.extName,
      extDescription: value.static.extDescription
    }
  };
}

let runtimeAssetUrlResolver: RuntimeAssetUrlResolver | null = null;

export function configureRuntimeAssetUrlResolver(resolver: RuntimeAssetUrlResolver | null): void {
  runtimeAssetUrlResolver = resolver;
}

function resolveAssetUrl(path: string): string {
  const normalizedPath = path.replace(/^\/+/, '');
  if (runtimeAssetUrlResolver) {
    return runtimeAssetUrlResolver(normalizedPath);
  }

  if (typeof document !== 'undefined' && document.baseURI) {
    return new URL(`/${normalizedPath}`, document.baseURI).toString();
  }

  return normalizedPath;
}

async function fetchJsonAsset(path: string): Promise<JsonValue> {
  if (typeof fetch !== 'function') {
    throw new Error('i18n asset loading requires fetch support.');
  }

  const url = resolveAssetUrl(path);
  const response = await fetch(url, { cache: 'force-cache' });
  if (!response.ok) {
    throw new Error(`Failed to load i18n asset ${path}: HTTP ${response.status}`);
  }

  return response.json().then((payload: JsonValue) => payload);
}

export async function loadRuntimeLocaleAsset(language: ReleaseLangCode): Promise<LocaleDefinition> {
  const asset = await fetchJsonAsset(`i18n/locales/${language}.json`);
  return readLocaleDefinitionAsset(asset, language);
}

export async function loadSchemaMessagesAsset(
  language: ReleaseLangCode
): Promise<GeneratedSchemaMessages> {
  const asset = await fetchJsonAsset(`i18n/schema/${language}.json`);
  if (!isRecord(asset) || !isSchemaMessagesAsset(asset)) {
    throw new Error(`Invalid i18n schema asset for ${language}.`);
  }
  return asset;
}
