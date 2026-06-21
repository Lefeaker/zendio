import { resolvePath } from '../pathResolver';
import { createVaultWriteSession, type VaultWriteSession } from '../services/obsidianWriter';
import type {
  LocalVaultPermissionPromptRequest,
  LocalVaultPermissionPromptResult
} from '../services/obsidianWriter';
import { selectVaultForClip } from '../services/vaultRouterService';
import type { ClassificationResult } from '../services/classificationService';
import type { Options } from '../store';
import {
  parseExportDestinationMetadata,
  toDownloadsFilename
} from '../../shared/exportDestination';
import type { ClipResultMessage, VaultConfig } from '../../shared/types';
import type { RestOptions } from '../../shared/types/options';
import {
  prepareVideoClipAttachments,
  type PreparedClipAttachments
} from './videoScreenshotAttachmentPlanner';

type ClipPayload = NonNullable<ClipResultMessage['payload']>;

export type ResolvedClipRoute =
  | {
      destination: 'downloads';
      filePath: string;
      restVault: '';
      prepared: PreparedClipAttachments;
    }
  | {
      destination: 'vault';
      filePath: string;
      vault: VaultConfig | null;
      restConfig: Options['rest'];
      prepared: PreparedClipAttachments;
      writeSession: VaultWriteSession;
    };

export interface ResolveClipRouteParams {
  options: Options;
  payload: ClipPayload;
  classification: ClassificationResult;
  requestLocalVaultPermission?: (
    request: LocalVaultPermissionPromptRequest
  ) => Promise<LocalVaultPermissionPromptResult>;
}

export async function resolveClipRoute({
  options,
  payload,
  classification,
  requestLocalVaultPermission
}: ResolveClipRouteParams): Promise<ResolvedClipRoute> {
  const filePath = resolvePath(options.templates, payload, classification, options.domainMappings);
  const exportDestination = parseExportDestinationMetadata(payload.meta?.exportDestination);
  const createDownloadsRoute = () => createDownloadsClipRoute(options, payload, filePath);

  if (exportDestination?.kind === 'downloads') {
    return createDownloadsRoute();
  }

  const { vault, restConfig } = selectVaultForClip(options, payload);
  if (!isWritableVaultRestConfig(restConfig)) {
    return createDownloadsRoute();
  }

  const prepared = prepareVideoClipAttachments({
    payload,
    notePath: filePath,
    destination: 'vault',
    ...(options.video?.screenshotAttachment
      ? { screenshotAttachmentOptions: options.video.screenshotAttachment }
      : {})
  });
  const writeSession = await createVaultWriteSession(restConfig, {
    ...(requestLocalVaultPermission ? { requestLocalVaultPermission } : {})
  });

  return {
    destination: 'vault',
    filePath,
    vault,
    restConfig,
    prepared,
    writeSession
  };
}

function createDownloadsClipRoute(
  options: Options,
  payload: ClipPayload,
  vaultFilePath: string
): Extract<ResolvedClipRoute, { destination: 'downloads' }> {
  const filePath = toDownloadsFilename(vaultFilePath);
  return {
    destination: 'downloads',
    filePath,
    restVault: '',
    prepared: prepareVideoClipAttachments({
      payload,
      notePath: filePath,
      destination: 'downloads',
      ...(options.video?.screenshotAttachment
        ? { screenshotAttachmentOptions: options.video.screenshotAttachment }
        : {})
    })
  };
}

function isWritableVaultRestConfig(restConfig: RestOptions): boolean {
  return Boolean(
    restConfig.localFolderId?.trim() || (restConfig.vault?.trim() && restConfig.apiKey?.trim())
  );
}
