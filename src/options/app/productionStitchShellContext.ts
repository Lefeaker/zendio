import type { Language, Messages } from '@i18n';
import type { CompleteOptions } from '@shared/types/options';
import { previewContent } from '@options/stitch/content';
import { createSchemaTranslator } from '@options/stitch/schema/i18n';
import type { PreviewContent, PreviewStoreState, SchemaContext } from '@options/stitch/types';
import {
  createProductionContent,
  resolveExtensionVersionLabel
} from './productionStitchStateMapper';
import { localizeStitchContent } from './productionStitchLocalization';

export function createProductionStitchAppData(
  draft: CompleteOptions,
  options: {
    connectionNotice?: PreviewContent['storage']['connectionNotice'];
    maintenanceLog: PreviewContent['maintenanceLog'];
  }
): PreviewContent {
  return createProductionContent(previewContent, draft, {
    ...(options.connectionNotice ? { connectionNotice: options.connectionNotice } : {}),
    maintenanceLog: options.maintenanceLog
  });
}

export function createProductionStitchSchemaContext(options: {
  appData: PreviewContent;
  language: Language;
  messages: Messages | null;
  state: PreviewStoreState;
}): SchemaContext {
  const localizedAppData = localizeStitchContent(options.appData, {
    language: options.language,
    messages: options.messages
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
    language: options.language,
    messages: options.messages,
    state: options.state,
    t: createSchemaTranslator(options.messages)
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
