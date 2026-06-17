import type { ConnectionChannelResult, ConnectionTestResult } from '../../shared/types/connection';
import type { UserVisibleMessageDescriptor } from '../../shared/i18n/userVisibleMessageDescriptor';
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
      label: 'localFolder',
      labelDescriptor: createDescriptor('connectionChannelLocalFolderLabel'),
      configured: false,
      success: false,
      message: '',
      messageDescriptor: createDescriptor('connectionLocalFolderNotConfigured')
    };
  }

  const result = await executeLocalFolderTest(config);
  return {
    channel: 'localFolder',
    label: 'localFolder',
    labelDescriptor: createDescriptor('connectionChannelLocalFolderLabel'),
    configured: true,
    success: result.success,
    message: result.message,
    ...(result.messageDescriptor ? { messageDescriptor: result.messageDescriptor } : {}),
    ...(result.error ? { error: result.error } : {}),
    ...(result.errorDescriptor ? { errorDescriptor: result.errorDescriptor } : {})
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
        message: '',
        messageDescriptor: createDescriptor('connectionLocalFolderAvailable', {
          folderName
        })
      };
    }
    const failure = formatLocalFolderFailure(permission, folderName);
    return {
      success: false,
      message: '',
      messageDescriptor: failure,
      error: formatLocalFolderErrorCode(permission, folderName),
      errorDescriptor: failure
    };
  } catch (error) {
    const detail = sanitizeSnippet(error instanceof Error ? error.message : String(error));
    const reason = detail ?? 'unknown error';
    const descriptor = createDescriptor('connectionLocalFolderWriteFailed', {
      folderName,
      reason
    });
    return {
      success: false,
      message: '',
      messageDescriptor: descriptor,
      error: `local_folder_test_failed:${reason}`,
      errorDescriptor: descriptor
    };
  }
}

function formatLocalFolderFailure(
  permission: LocalVaultPermissionState,
  folderName: string
): UserVisibleMessageDescriptor {
  if (permission === 'prompt') {
    return createDescriptor('connectionLocalFolderNeedsReauthorization', { folderName });
  }
  if (permission === 'denied') {
    return createDescriptor('connectionLocalFolderPermissionDenied', { folderName });
  }
  if (permission === 'missing') {
    return createDescriptor('connectionLocalFolderUnavailable', { folderName });
  }
  if (permission === 'unsupported') {
    return createDescriptor('connectionLocalFolderUnsupported');
  }
  return createDescriptor('connectionLocalFolderUnavailable', { folderName });
}

function createDescriptor<Key extends string>(
  key: Key,
  values?: Record<string, string | number | boolean>
): UserVisibleMessageDescriptor<Key> {
  return {
    key,
    ...(values ? { values } : {})
  };
}

function formatLocalFolderErrorCode(
  permission: LocalVaultPermissionState,
  folderName: string
): string {
  if (permission === 'prompt') {
    return `local_folder_reauthorization_required:${folderName}`;
  }
  if (permission === 'denied') {
    return `local_folder_permission_denied:${folderName}`;
  }
  if (permission === 'missing') {
    return `local_folder_unavailable:${folderName}`;
  }
  if (permission === 'unsupported') {
    return 'local_folder_unsupported';
  }
  return `local_folder_unavailable:${folderName}`;
}
