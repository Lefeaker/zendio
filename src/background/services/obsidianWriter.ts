import type { Options } from '../store';
import type { RestConnection } from '../../shared/interfaces/restClient';
import type { RestClient } from '../../shared/interfaces/restClient';
import { getService } from '../../shared/di';
import { TOKENS } from '../../shared/di/tokens';
import type { PlatformServices } from '../../platform/types';
import { ErrorSeverity, handleError, type AppError } from '../../shared/errors';
import { restErrors } from '../../shared/errors/restErrors';
import type { LocalVaultPermissionState } from '../../platform/interfaces/fileSystemAccess';

export type VaultStorageTarget = 'local-folder' | 'rest-api';
export type LocalVaultFallbackReason =
  | 'permission-denied'
  | 'folder-missing'
  | 'unsupported'
  | 'write-preflight-failed';

export interface VaultWriteTargetInfo {
  storageTarget: VaultStorageTarget;
  localFolderName?: string;
  fallbackReason?: LocalVaultFallbackReason;
}

export interface VaultWriteSession {
  target: VaultWriteTargetInfo;
  writeMarkdown(filePath: string, markdown: string): Promise<void>;
  writeAttachment(filePath: string, dataUrl: string, mimeType: string): Promise<void>;
}

export interface LocalVaultPermissionPromptRequest {
  folderId: string;
  folderName?: string;
  vaultName?: string;
}

export interface LocalVaultPermissionPromptResult {
  action: 'granted' | 'use-rest' | 'cancelled';
  permissionState?: LocalVaultPermissionState;
  persistRest?: boolean;
  errorMessage?: string;
}

export interface VaultWriteSessionOptions {
  requestLocalVaultPermission?: (
    request: LocalVaultPermissionPromptRequest
  ) => Promise<LocalVaultPermissionPromptResult>;
}

function getObsidianRestClient(): RestClient {
  return getService<PlatformServices>(TOKENS.platformServices).restClient;
}

function resolvePlatformServicesFromDi(): PlatformServices {
  return getService<PlatformServices>(TOKENS.platformServices);
}

export async function writeMarkdownToVault(
  rest: Options['rest'],
  filePath: string,
  markdown: string
): Promise<void> {
  const session = await createVaultWriteSession(rest);
  await session.writeMarkdown(filePath, markdown);
}

export async function writeAttachmentToVault(
  rest: Options['rest'],
  filePath: string,
  dataUrl: string,
  mimeType: string
): Promise<void> {
  const session = await createVaultWriteSession(rest);
  await session.writeAttachment(filePath, dataUrl, mimeType);
}

export async function createVaultWriteSession(
  rest: Options['rest'],
  options: VaultWriteSessionOptions = {}
): Promise<VaultWriteSession> {
  const platform = resolvePlatformServicesFromDi();
  const restClient = platform.restClient ?? getObsidianRestClient();
  const connection = toRestConnection(rest);

  if (!rest.localFolderId) {
    return createRestWriteSession(restClient, connection, { storageTarget: 'rest-api' });
  }

  try {
    const permission = await platform.fileSystemAccess.queryPermission(rest.localFolderId);
    if (permission === 'granted') {
      return createLocalWriteSession(platform, rest, {
        storageTarget: 'local-folder',
        ...(rest.localFolderName ? { localFolderName: rest.localFolderName } : {})
      });
    }

    if (permission === 'prompt' && options.requestLocalVaultPermission) {
      const reauthResult = await options.requestLocalVaultPermission({
        folderId: rest.localFolderId,
        ...(rest.localFolderName ? { folderName: rest.localFolderName } : {}),
        ...(rest.vault ? { vaultName: rest.vault } : {})
      });
      if (reauthResult.action === 'granted') {
        const verified = await platform.fileSystemAccess.queryPermission(rest.localFolderId);
        if (verified === 'granted') {
          return createLocalWriteSession(platform, rest, {
            storageTarget: 'local-folder',
            ...(rest.localFolderName ? { localFolderName: rest.localFolderName } : {})
          });
        }
        console.warn(
          '[obsidianWriter] Local vault reauthorization did not verify as granted; using REST:',
          verified
        );
        return createRestWriteSession(restClient, connection, {
          storageTarget: 'rest-api',
          ...(rest.localFolderName ? { localFolderName: rest.localFolderName } : {}),
          fallbackReason: mapPermissionFallbackReason(verified)
        });
      }

      const fallbackPermission = reauthResult.permissionState ?? permission;
      console.warn(
        '[obsidianWriter] Local vault reauthorization was not granted; using REST:',
        fallbackPermission
      );
      return createRestWriteSession(restClient, connection, {
        storageTarget: 'rest-api',
        ...(rest.localFolderName ? { localFolderName: rest.localFolderName } : {}),
        fallbackReason: mapPermissionFallbackReason(fallbackPermission)
      });
    }

    console.warn(
      '[obsidianWriter] Local vault unavailable before writing; using REST:',
      permission
    );
    return createRestWriteSession(restClient, connection, {
      storageTarget: 'rest-api',
      ...(rest.localFolderName ? { localFolderName: rest.localFolderName } : {}),
      fallbackReason: mapPermissionFallbackReason(permission)
    });
  } catch (error) {
    console.warn('[obsidianWriter] Local vault permission preflight failed; using REST:', error);
    return createRestWriteSession(restClient, connection, {
      storageTarget: 'rest-api',
      ...(rest.localFolderName ? { localFolderName: rest.localFolderName } : {}),
      fallbackReason: 'write-preflight-failed'
    });
  }
}

function createLocalWriteSession(
  platform: PlatformServices,
  rest: Options['rest'],
  target: VaultWriteTargetInfo
): VaultWriteSession {
  const folderId = rest.localFolderId;
  if (folderId === undefined || folderId.length === 0) {
    throw new Error('Cannot create a local write session without a local folder id.');
  }
  const localFolderId = folderId;

  async function writeLocalFile(
    filePath: string,
    content: BodyInit,
    contentType: string
  ): Promise<void> {
    try {
      await platform.fileSystemAccess.writeFile({
        folderId: localFolderId,
        filePath,
        content: normalizeLocalContent(content),
        contentType
      });
    } catch (error) {
      throw createLocalWriteFailedError(rest, filePath, error);
    }
  }

  return {
    target,
    writeMarkdown(filePath: string, markdown: string): Promise<void> {
      return writeLocalFile(filePath, markdown, 'text/markdown; charset=utf-8');
    },
    writeAttachment(filePath: string, dataUrl: string, mimeType: string): Promise<void> {
      return writeLocalFile(filePath, dataUrlToBlob(dataUrl, mimeType), mimeType);
    }
  };
}

function createRestWriteSession(
  restClient: RestClient,
  connection: RestConnection,
  target: VaultWriteTargetInfo
): VaultWriteSession {
  return {
    target,
    writeMarkdown(filePath: string, markdown: string): Promise<void> {
      return writeVaultFile(
        restClient,
        connection,
        target,
        filePath,
        markdown,
        'text/markdown; charset=utf-8'
      );
    },
    writeAttachment(filePath: string, dataUrl: string, mimeType: string): Promise<void> {
      return writeVaultFile(
        restClient,
        connection,
        target,
        filePath,
        dataUrlToBlob(dataUrl, mimeType),
        mimeType
      );
    }
  };
}

async function writeVaultFile(
  restClient: RestClient,
  connection: RestConnection,
  target: VaultWriteTargetInfo,
  filePath: string,
  content: BodyInit,
  contentType: string
): Promise<void> {
  try {
    await restClient.writeFile(connection, filePath, content, { contentType });
  } catch (error) {
    await handleError(
      restErrors.requestFailed(
        `Failed to write file to vault: ${filePath}`,
        {
          endpoint: connection.baseUrl,
          vault: connection.vault,
          method: 'PUT',
          filePath
        },
        { cause: error }
      ),
      { suppressNotifications: true }
    );
    if (target.fallbackReason) {
      throw createLocalFallbackRestFailedError(connection, target, filePath, error);
    }
    throw error;
  }
}

function toRestConnection(rest: Options['rest']): RestConnection {
  return {
    baseUrl: rest.baseUrl,
    vault: rest.vault,
    apiKey: rest.apiKey,
    ...(rest.httpsUrl !== undefined && { httpsUrl: rest.httpsUrl }),
    ...(rest.httpUrl !== undefined && { httpUrl: rest.httpUrl })
  };
}

function mapPermissionFallbackReason(
  permission: LocalVaultPermissionState
): LocalVaultFallbackReason {
  if (permission === 'granted') {
    return 'write-preflight-failed';
  }
  if (permission === 'missing') {
    return 'folder-missing';
  }
  if (permission === 'unsupported') {
    return 'unsupported';
  }
  if (permission === 'prompt') {
    return 'write-preflight-failed';
  }
  return 'permission-denied';
}

function createLocalFallbackRestFailedError(
  connection: RestConnection,
  target: VaultWriteTargetInfo,
  filePath: string,
  cause: unknown
): AppError {
  const folderName = target.localFolderName ?? connection.vault;
  return {
    code: 'LOCAL_VAULT_REAUTH_REQUIRED',
    domain: 'background',
    message: `Local vault permission is not granted and REST fallback failed: ${filePath}`,
    userMessage: `本地目录需要重新授权，且 REST API 保存失败。请到设置页点击本地目录“${folderName}”重新授权。`,
    severity: ErrorSeverity.ERROR,
    recoverable: true,
    context: {
      filePath,
      vault: connection.vault,
      localFolderName: folderName,
      fallbackReason: target.fallbackReason
    },
    cause
  };
}

function createLocalWriteFailedError(
  rest: Options['rest'],
  filePath: string,
  cause: unknown
): AppError {
  const folderName = rest.localFolderName ?? rest.vault;
  return {
    code: 'LOCAL_VAULT_WRITE_FAILED',
    domain: 'background',
    message: `Local vault write failed: ${filePath}`,
    userMessage: `本地目录写入失败：${folderName}`,
    severity: ErrorSeverity.ERROR,
    recoverable: true,
    context: {
      filePath,
      localFolderName: folderName,
      vault: rest.vault
    },
    cause
  };
}

function normalizeLocalContent(content: BodyInit): string | Blob | ArrayBuffer | Uint8Array {
  if (
    typeof content === 'string' ||
    content instanceof Blob ||
    content instanceof ArrayBuffer ||
    content instanceof Uint8Array
  ) {
    return content;
  }
  throw new Error('Unsupported local vault content body.');
}

function dataUrlToBlob(dataUrl: string, fallbackMimeType: string): Blob {
  const match = /^data:([^;,]+);base64,(.+)$/u.exec(dataUrl);
  if (!match) {
    throw new Error('Invalid attachment data URL.');
  }
  const [, mimeType, base64] = match;
  const binary = globalThis.atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: mimeType || fallbackMimeType });
}
