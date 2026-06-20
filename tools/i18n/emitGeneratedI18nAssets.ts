import type { LocaleStaticMessages } from '../../src/i18n/localeDefinition';
import type { CompiledCatalog } from './compileCatalog';

interface RuntimeAsset {
  runtime: Record<string, string>;
  static: LocaleStaticMessages;
}

function readStaticMessages(compiled: CompiledCatalog, code: string): LocaleStaticMessages {
  const staticMessages = compiled.staticCatalogs[code];
  if (
    !staticMessages ||
    typeof staticMessages.extName !== 'string' ||
    typeof staticMessages.extDescription !== 'string'
  ) {
    throw new Error(`Missing static messages for locale ${code}`);
  }

  return {
    extName: staticMessages.extName,
    extDescription: staticMessages.extDescription
  };
}

function stripSchemaRuntimeMessages(
  runtimeMessages: CompiledCatalog['locales'][string]
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(runtimeMessages).filter(([key]) => !key.startsWith('schema'))
  );
}

function renderJsonAsset(value: RuntimeAsset | CompiledCatalog['locales'][string]): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function createAssetEntry(path: string, contents: string): [string, string] {
  return [path, contents];
}

export function emitGeneratedRuntimeAssets(compiled: CompiledCatalog): Map<string, string> {
  return new Map(
    compiled.localeCodes.map((code) => {
      const asset: RuntimeAsset = {
        runtime: stripSchemaRuntimeMessages(compiled.locales[code]),
        static: readStaticMessages(compiled, code)
      };
      return createAssetEntry(`public/i18n/locales/${code}.json`, renderJsonAsset(asset));
    })
  );
}

export function emitGeneratedSchemaAssets(compiled: CompiledCatalog): Map<string, string> {
  return new Map(
    compiled.localeCodes.map((code) => [
      `public/i18n/schema/${code}.json`,
      renderJsonAsset(compiled.locales[code])
    ])
  );
}
