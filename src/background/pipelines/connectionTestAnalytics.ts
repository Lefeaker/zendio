import type { ConnectionTestResult } from '../../shared/types/connection';
import type {
  FailureCategory as AnalyticsFailureCategory,
  StorageTarget
} from '../../shared/types/analytics';

const LOCAL_FOLDER_UNSUPPORTED_KEYS = new Set(['connectionLocalFolderUnsupported']);
const VALIDATION_KEYS = new Set([
  'connectionNoUsableAddress',
  'connectionRestApiKeyMissing',
  'connectionRestVaultNameMissing',
  'connectionRestUrlMissing',
  'schemaStorageNoEnabledVaults'
]);

export type ConnectionTestAnalyticsSummary = {
  result: ConnectionTestResult;
  storageTarget: StorageTarget;
  failureCategory?: AnalyticsFailureCategory;
};

export function summarizeVaultStorageTargetTest(
  result: ConnectionTestResult,
  storageTarget: StorageTarget
): ConnectionTestAnalyticsSummary {
  return {
    result,
    storageTarget,
    ...(!result.success ? { failureCategory: inferChannelFailureCategory(result) } : {})
  };
}

function inferChannelFailureCategory(result: ConnectionTestResult): AnalyticsFailureCategory {
  const channels = result.channels ?? [];
  const failedConfiguredChannels = channels.filter(
    (channel) => channel.configured && !channel.success
  );
  const failedLocalFolder = failedConfiguredChannels.find(
    (channel) => channel.channel === 'localFolder'
  );
  if (failedLocalFolder) {
    const descriptorKey =
      failedLocalFolder.errorDescriptor?.key ?? failedLocalFolder.messageDescriptor?.key;
    if (
      (typeof descriptorKey === 'string' && LOCAL_FOLDER_UNSUPPORTED_KEYS.has(descriptorKey)) ||
      failedLocalFolder.error?.startsWith('local_folder_unsupported')
    ) {
      return 'unsupported';
    }
    return 'permission';
  }

  const descriptorKeys = [
    result.errorDescriptor?.key,
    result.messageDescriptor?.key,
    ...failedConfiguredChannels.flatMap((channel) => [
      channel.errorDescriptor?.key,
      channel.messageDescriptor?.key
    ])
  ].filter((key): key is string => typeof key === 'string');

  if (descriptorKeys.some((key) => VALIDATION_KEYS.has(key))) {
    return 'validation';
  }

  const failureText = [
    result.error,
    result.message,
    ...failedConfiguredChannels.flatMap((channel) => [channel.error, channel.message])
  ]
    .filter((message): message is string => typeof message === 'string' && message.length > 0)
    .join('\n')
    .toLowerCase();

  return failureText.includes('timeout') ? 'timeout' : 'connection';
}
