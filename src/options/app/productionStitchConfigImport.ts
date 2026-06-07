import { mergeOptions } from '@shared/config/optionsMerger';
import { parseConfigInput, readConfigTextFromClipboard } from '@options/services/configTransfer';
import type { CompleteOptions } from '@shared/types/options';

export async function readImportedConfigurationFromClipboard(): Promise<{
  analytics: Awaited<ReturnType<typeof parseConfigInput>>['analytics'];
  analyticsPayloadPresent: boolean;
  imported: CompleteOptions;
  version: Awaited<ReturnType<typeof parseConfigInput>>['version'];
}> {
  const parsed = parseConfigInput(await readConfigTextFromClipboard());
  return {
    analytics: parsed.analytics,
    analyticsPayloadPresent: parsed.analytics !== undefined,
    imported: mergeOptions(parsed.options) as CompleteOptions,
    version: parsed.version
  };
}
