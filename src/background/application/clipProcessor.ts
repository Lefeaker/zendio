import { getOptions } from '../store';
import { resolvePath } from '../pathResolver';
import { selectVaultForClip } from '../services/vaultRouterService';
import { classifyClip } from '../services/classificationService';
import type { ClassificationResult } from '../services/classificationService';
import { createVaultWriteSession } from '../services/obsidianWriter';
import type {
  LocalVaultFallbackReason,
  LocalVaultPermissionPromptRequest,
  LocalVaultPermissionPromptResult,
  VaultStorageTarget
} from '../services/obsidianWriter';
import { recordClipUsage } from '../services/usageStats';
import type { ClipResultMessage } from '../../shared/types';
import {
  parseExportDestinationMetadata,
  toDownloadsFilename
} from '../../shared/exportDestination';
import { sanitizeDownloadsPathSegment } from '../../shared/downloadsFilename';
import { isAppError, normalizeToAppError } from '../../shared/errors';
import type { AppError } from '../../shared/errors';
import { getService } from '../../shared/di';
import { TOKENS } from '../../shared/di/tokens';
import type { PlatformServices } from '../../platform/types';

export interface ClipProcessingResult {
  filePath: string;
  vaultName?: string;
  restVault: string;
  destination: 'vault' | 'downloads';
  storageTarget: VaultStorageTarget | 'downloads';
  localFolderName?: string;
  fallbackReason?: LocalVaultFallbackReason;
  classification: ClassificationResult;
  classificationWarning?: AppError;
}

type ClipPayload = NonNullable<ClipResultMessage['payload']>;

export interface ClipProcessingProgress {
  value: number;
  label: string;
}

export interface ClipProcessingHooks {
  onProgress?: (progress: ClipProcessingProgress) => void;
  requestLocalVaultPermission?: (
    request: LocalVaultPermissionPromptRequest
  ) => Promise<LocalVaultPermissionPromptResult>;
}

interface ClipAttachment {
  id: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
}

interface ResolvedClipAttachment extends ClipAttachment {
  outputPath: string;
  markdownPath: string;
}

interface PreparedClipPayload {
  markdown: string;
  attachments: ResolvedClipAttachment[];
}

function getDownloadsService(): PlatformServices['downloads'] {
  return getService<PlatformServices>(TOKENS.platformServices).downloads;
}

export async function processClipPayload(
  payload: ClipPayload,
  hooks: ClipProcessingHooks = {}
): Promise<ClipProcessingResult> {
  hooks.onProgress?.({ value: 48, label: '正在读取设置与分类' });
  const options = await getOptions();
  const classification = await classifyClip(options, payload);
  const filePath = resolvePath(options.templates, payload, classification, options.domainMappings);
  const exportDestination = parseExportDestinationMetadata(payload.meta?.exportDestination);

  if (exportDestination?.kind === 'downloads') {
    hooks.onProgress?.({ value: 74, label: '正在保存到下载目录' });
    const filename = toDownloadsFilename(filePath);
    const prepared = prepareClipAttachments(payload, filename, 'downloads');
    const downloads = getDownloadsService();
    for (const attachment of prepared.attachments) {
      await downloads.download({
        filename: attachment.outputPath,
        url: attachment.dataUrl,
        mimeType: attachment.mimeType
      });
    }
    await downloads.download({
      filename,
      content: prepared.markdown,
      mimeType: 'text/markdown;charset=utf-8'
    });

    try {
      await recordClipUsage(payload);
    } catch (usageError) {
      console.warn('[clipProcessor] Failed to record usage stats:', usageError);
    }

    return {
      filePath: filename,
      restVault: '',
      destination: 'downloads',
      storageTarget: 'downloads',
      classification
    };
  }

  hooks.onProgress?.({ value: 56, label: '正在选择 Obsidian 仓库' });
  const { vault, restConfig } = selectVaultForClip(options, payload);
  const prepared = prepareClipAttachments(payload, filePath, 'vault');
  const writeSession = await createVaultWriteSession(restConfig, {
    ...(hooks.requestLocalVaultPermission
      ? { requestLocalVaultPermission: hooks.requestLocalVaultPermission }
      : {})
  });

  if (prepared.attachments.length) {
    hooks.onProgress?.({ value: 68, label: '正在写入附件' });
  }
  for (const attachment of prepared.attachments) {
    await writeSession.writeAttachment(
      attachment.outputPath,
      attachment.dataUrl,
      attachment.mimeType
    );
  }

  hooks.onProgress?.({ value: 82, label: '正在写入笔记' });
  await writeSession.writeMarkdown(filePath, prepared.markdown);

  hooks.onProgress?.({ value: 94, label: '正在记录发送结果' });
  try {
    await recordClipUsage(payload);
  } catch (usageError) {
    console.warn('[clipProcessor] Failed to record usage stats:', usageError);
  }

  const classificationWarning =
    classification.status === 'fallback' && classification.fallbackReason === 'error'
      ? classification.errorDetail
        ? isAppError(classification.errorDetail)
          ? classification.errorDetail
          : normalizeToAppError(classification.errorDetail, {
              code: 'CLASSIFICATION_WARNING_INVALID',
              domain: 'classifier',
              defaultMessage: 'Classification warning could not be normalized.',
              context: {
                ...(payload.meta?.url !== undefined && { url: payload.meta.url }),
                ...(payload.type !== undefined && { payloadType: payload.type })
              }
            })
        : undefined
      : undefined;

  const result: ClipProcessingResult = {
    filePath,
    restVault: restConfig.vault,
    destination: 'vault',
    storageTarget: writeSession.target.storageTarget,
    classification,
    ...(vault?.name !== undefined && { vaultName: vault.name }),
    ...(writeSession.target.localFolderName !== undefined && {
      localFolderName: writeSession.target.localFolderName
    }),
    ...(writeSession.target.fallbackReason !== undefined && {
      fallbackReason: writeSession.target.fallbackReason
    }),
    ...(classificationWarning !== undefined && { classificationWarning })
  };

  return result;
}

function prepareClipAttachments(
  payload: ClipPayload,
  notePath: string,
  destination: 'vault' | 'downloads'
): PreparedClipPayload {
  const attachments = parseClipAttachments(payload.meta?.attachments);
  if (attachments.length === 0) {
    return { markdown: payload.markdown, attachments: [] };
  }

  const noteName = getFileStem(notePath);
  const noteDirectory = getDirectoryName(notePath);
  const resolvedAttachments = attachments.map((attachment) => {
    const fileName = sanitizeAttachmentFileName(attachment.fileName);
    if (destination === 'downloads') {
      const shouldUseFolder = attachments.length > 1;
      const markdownPath = shouldUseFolder ? `${noteName}/${fileName}` : fileName;
      return {
        ...attachment,
        fileName,
        outputPath: markdownPath,
        markdownPath
      };
    }

    const markdownPath = `assets/${noteName}/${fileName}`;
    return {
      ...attachment,
      fileName,
      outputPath: joinPath(noteDirectory, markdownPath),
      markdownPath
    };
  });

  const markdown = resolvedAttachments.reduce((current, attachment) => {
    const marker = `aiob-attachment:${attachment.id}`;
    return current.split(marker).join(attachment.markdownPath);
  }, payload.markdown);

  return {
    markdown,
    attachments: resolvedAttachments
  };
}

function parseClipAttachments(value: unknown): ClipAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item): ClipAttachment[] => {
    if (typeof item !== 'object' || item === null) {
      return [];
    }
    const candidate = item as Partial<ClipAttachment>;
    if (
      typeof candidate.id !== 'string' ||
      typeof candidate.fileName !== 'string' ||
      typeof candidate.mimeType !== 'string' ||
      typeof candidate.dataUrl !== 'string' ||
      !candidate.dataUrl.startsWith(`data:${candidate.mimeType};base64,`)
    ) {
      return [];
    }
    return [
      {
        id: candidate.id,
        fileName: candidate.fileName,
        mimeType: candidate.mimeType,
        dataUrl: candidate.dataUrl
      }
    ];
  });
}

function getFileStem(filePath: string): string {
  const fileName = filePath.split(/[\\/]/u).filter(Boolean).at(-1) ?? 'note.md';
  const withoutExtension = fileName.replace(/\.[^.]+$/u, '');
  return sanitizeDownloadsPathSegment(withoutExtension, 'note');
}

function getDirectoryName(filePath: string): string {
  return filePath.split(/[\\/]/u).filter(Boolean).slice(0, -1).join('/');
}

function joinPath(...segments: string[]): string {
  return segments
    .flatMap((segment) => segment.split(/[\\/]/u))
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join('/');
}

function sanitizeAttachmentFileName(fileName: string): string {
  const safeName = fileName.split(/[\\/]/u).filter(Boolean).at(-1);
  return sanitizeDownloadsPathSegment(safeName, 'attachment.jpg');
}
