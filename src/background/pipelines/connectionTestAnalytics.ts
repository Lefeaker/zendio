import type { ConnectionTestResult } from '../../shared/types/connection';
import type {
  FailureCategory as AnalyticsFailureCategory,
  StorageTarget
} from '../../shared/types/analytics';

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
  const failureText = [
    result.error,
    result.message,
    ...failedConfiguredChannels.flatMap((channel) => [channel.error, channel.message])
  ]
    .filter((message): message is string => typeof message === 'string' && message.length > 0)
    .join('\n')
    .toLowerCase();

  if (failedLocalFolder) {
    return failureText.includes('unsupported') || failureText.includes('不支持')
      ? 'unsupported'
      : 'permission';
  }
  if (failureText.includes('未配置') || failureText.includes('config error')) {
    return 'validation';
  }
  return failureText.includes('timeout') ? 'timeout' : 'connection';
}
