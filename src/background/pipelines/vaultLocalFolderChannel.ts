import type { ConnectionChannelResult, ConnectionTestResult } from '../../shared/types/connection';
import { getService } from '../../shared/di';
import { TOKENS } from '../../shared/di/tokens';
import type { PlatformServices } from '../../platform/types';
import type { LocalVaultPermissionState } from '../../platform/interfaces/fileSystemAccess';
import type { ConnectionTestConfig } from './vaultConnectionTypes';
import { sanitizeSnippet } from './vaultConnectionChannelUtils';

export async function executeLocalFolderChannelTest(
  config: ConnectionTestConfig
): Promise<ConnectionChannelResult> {
  if (!config.localFolderId) {
    return {
      channel: 'localFolder',
      label: '本地目录',
      configured: false,
      success: false,
      message: '未配置本地目录'
    };
  }

  const result = await executeLocalFolderTest(config);
  return {
    channel: 'localFolder',
    label: '本地目录',
    configured: true,
    success: result.success,
    message: result.message,
    ...(result.error ? { error: result.error } : {})
  };
}

async function executeLocalFolderTest(config: ConnectionTestConfig): Promise<ConnectionTestResult> {
  const folderName = config.localFolderName || config.label || config.vault;
  try {
    const permission = await getService<PlatformServices>(
      TOKENS.platformServices
    ).fileSystemAccess.queryPermission(config.localFolderId ?? '');
    if (permission === 'granted') {
      return {
        success: true,
        message: `本地目录可用：${folderName}`
      };
    }
    return {
      success: false,
      message: formatLocalFolderFailure(permission, folderName),
      error: formatLocalFolderFailure(permission, folderName)
    };
  } catch (error) {
    const detail = sanitizeSnippet(error instanceof Error ? error.message : String(error));
    const message = `本地目录测试失败：${folderName}${detail ? ` - ${detail}` : ''}`;
    return {
      success: false,
      message,
      error: message
    };
  }
}

function formatLocalFolderFailure(
  permission: LocalVaultPermissionState,
  folderName: string
): string {
  if (permission === 'prompt') {
    return `本地目录需要重新授权：${folderName}`;
  }
  if (permission === 'denied') {
    return `本地目录权限被拒绝：${folderName}`;
  }
  if (permission === 'missing') {
    return `本地目录记录不存在，请重新选择：${folderName}`;
  }
  if (permission === 'unsupported') {
    return '当前浏览器不支持本地目录测试。';
  }
  return `本地目录不可用：${folderName}`;
}
