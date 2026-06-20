import type { Language, Messages } from '@i18n';
import type { CompleteOptions } from '@shared/types/options';
import { isAnalyticsDebugModeControlAvailable } from '@shared/analytics';
import {
  createSchemaTranslator,
  DEFAULT_PRODUCTION_ENGLISH_MESSAGES
} from '@options/stitch/schema/i18n';
import type { PreviewContent, PreviewStoreState, SchemaContext } from '@options/stitch/types';
import {
  createProductionContent,
  resolveExtensionVersionLabel
} from './productionStitchStateMapper';
import { localizeStitchContent } from './productionStitchLocalization';

type ProductionStitchAppDataOptions = {
  connectionNotice?: PreviewContent['storage']['connectionNotice'];
  maintenanceLog: PreviewContent['maintenanceLog'];
};

function isPreviewContent(value: unknown): value is PreviewContent {
  return typeof value === 'object' && value !== null && 'brand' in value && 'nav' in value;
}

function resolveDefaultPreviewContent(): PreviewContent {
  const globalAssets = (
    globalThis as typeof globalThis & {
      __AIIINOB_TEST_STITCH_ASSETS__?: { previewContent: PreviewContent };
    }
  ).__AIIINOB_TEST_STITCH_ASSETS__;

  if (globalAssets?.previewContent) {
    return globalAssets.previewContent;
  }

  throw new Error('[Options] Preview content is required to create production stitch app data.');
}

export function createProductionStitchAppData(
  previewContentOrDraft: PreviewContent | CompleteOptions,
  draftOrOptions: CompleteOptions | ProductionStitchAppDataOptions,
  maybeOptions?: ProductionStitchAppDataOptions
): PreviewContent {
  const previewContent = isPreviewContent(previewContentOrDraft)
    ? previewContentOrDraft
    : resolveDefaultPreviewContent();
  const draft = isPreviewContent(previewContentOrDraft)
    ? (draftOrOptions as CompleteOptions)
    : previewContentOrDraft;
  const options = isPreviewContent(previewContentOrDraft)
    ? (maybeOptions as ProductionStitchAppDataOptions)
    : (draftOrOptions as ProductionStitchAppDataOptions);

  return createProductionContent(previewContent, draft, {
    ...(options.connectionNotice ? { connectionNotice: options.connectionNotice } : {}),
    maintenanceLog: options.maintenanceLog
  });
}

export function createProductionStitchSchemaContext(options: {
  appData: PreviewContent;
  capabilities?: SchemaContext['capabilities'];
  previewContent?: PreviewContent;
  language: Language;
  messages: Messages | null;
  state: PreviewStoreState;
}): SchemaContext {
  const effectiveMessages = options.messages ?? DEFAULT_PRODUCTION_ENGLISH_MESSAGES;
  const localizedAppData = localizeStitchContent(options.appData, {
    language: options.language,
    messages: effectiveMessages,
    previewContent: options.previewContent ?? options.appData
  });
  return {
    appData: {
      ...localizedAppData,
      brand: {
        ...localizedAppData.brand,
        title: 'Zendio',
        subtitle: resolveExtensionVersionLabel(),
        logo: '../icons/bannerlogo-128.png'
      }
    },
    capabilities: {
      analyticsDebugMode: isAnalyticsDebugModeControlAvailable(),
      ...options.capabilities
    },
    language: options.language,
    messages: effectiveMessages,
    state: options.state,
    t: createSchemaTranslator(effectiveMessages)
  };
}

export function syncProductionDomainEntries(
  draft: CompleteOptions,
  entries: Array<[string, string]>
): Array<[string, string]> {
  draft.domainMappings = entries.reduce<Record<string, string>>((next, [domain, alias]) => {
    const key = domain.trim();
    if (key) {
      next[key] = alias.trim();
    }
    return next;
  }, {});
  return entries.map(([domain, alias]) => [domain, alias]);
}

export function resolveProductionDomainEntries(
  domainMappingRows: Array<[string, string]>
): Array<[string, string]> {
  return domainMappingRows.length
    ? domainMappingRows.map(([domain, alias]) => [domain, alias])
    : [['', '']];
}

export function createProductionStitchMutator(options: {
  getState(): PreviewStoreState;
  render(): void;
}) {
  return (
    mutator: (draftState: PreviewStoreState) => void,
    mutateOptions: { silent?: boolean } = {}
  ) => {
    mutator(options.getState());
    if (!mutateOptions.silent) {
      options.render();
    }
  };
}
