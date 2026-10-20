import {
  withRequestDeadline,
  type RequestDeadlineOptions
} from '../../shared/utils/requestDeadline';
import { DOWNLOAD_TIMEOUT_MS } from '../../platform/downloadCompletion';
import type { DownloadsService } from '../../platform/interfaces/downloads';
import type { ClipAttachmentProgress } from '../../shared/types/clipResult';
import { serializedAttachmentContentToBlob } from '../../shared/attachments/clipAttachmentBinary';
import {
  encodeAttachmentMarkdownPath,
  replaceClipAttachmentReferences
} from '../../shared/attachments/clipAttachmentReferences';
import { renderAttachmentMarkdownUrl } from '../../shared/attachments/videoScreenshotAttachmentTemplates';
import type {
  PreparedClipAttachments,
  PreparedClipAttachment
} from './videoScreenshotAttachmentPlanner';

type WriteStage = 'write_attachments' | 'write_markdown';

/** Preserve browser uniquification in references without embedding the local Downloads root. */
function downloadedAttachmentUrl(attachment: PreparedClipAttachment, filename: string): string {
  const normalized = filename.replace(/\\/gu, '/');
  const actualName = normalized.split('/').pop();
  if (!actualName) throw new Error('Downloaded attachment filename is unavailable.');
  const directory = attachment.outputPath.slice(0, attachment.outputPath.lastIndexOf('/') + 1);
  // Chromium's native filename validation replaces percent signs with underscores.
  // Accept that known transformation, while retaining the requested-folder boundary.
  const actualDirectory = [directory, directory.replaceAll('%', '_')].find((candidate) => {
    const relative = `${candidate}${actualName}`;
    return normalized === relative || normalized.endsWith(`/${relative}`);
  });
  if (actualDirectory === undefined) {
    throw new Error('Downloaded attachment moved outside its requested folder.');
  }
  const relativePath = `${actualDirectory}${actualName}`;
  if (relativePath === attachment.outputPath) return attachment.markdownUrl;
  const encodedName = encodeAttachmentMarkdownPath(actualName);
  return renderAttachmentMarkdownUrl(attachment, {
    generatedFileName: encodedName,
    generatedAttachmentFilePath: `${actualDirectory}${encodedName}`,
    markdownPath: relativePath
  });
}

export async function downloadPreparedClip(input: {
  downloads: DownloadsService;
  filePath: string;
  sourceMarkdown: string;
  prepared: PreparedClipAttachments;
  attachmentProgress?: ClipAttachmentProgress;
  requestOptions?: RequestDeadlineOptions;
  completeStage: <T>(stage: WriteStage, action: () => Promise<T>) => Promise<T>;
}): Promise<{
  filePath: string;
  downloadId: number | string;
  downloadIds: Array<number | string>;
}> {
  return withRequestDeadline(DOWNLOAD_TIMEOUT_MS, input.requestOptions ?? {}, async (request) => {
    const { downloads, prepared, completeStage } = input;
    const requestOptions = { ...input.requestOptions, signal: request.signal };
    const downloadIds: Array<number | string> = [];
    const attachmentUrls: Array<Pick<PreparedClipAttachment, 'id' | 'markdownUrl'>> = [];
    const progress = input.attachmentProgress;
    // Check every historically confirmed file before writing any remaining file.
    for (const confirmed of progress?.confirmed ?? []) {
      request.check();
      const download = confirmed.download;
      const current = download ? await downloads.inspect?.(download.id) : undefined;
      request.check();
      if (
        !download ||
        current?.state !== 'complete' ||
        current.exists !== true ||
        current.filename !== download.filename
      ) {
        if (progress) progress.blocked = true;
        throw new Error('CLIP_CONFIRMED_ATTACHMENT_UNAVAILABLE');
      }
    }
    if (prepared.attachments.length) {
      await completeStage('write_attachments', async () => {
        for (const [index, attachment] of prepared.attachments.entries()) {
          request.check();
          const confirmed = progress?.confirmed[index]?.download;
          if (confirmed) {
            downloadIds.push(confirmed.id);
            attachmentUrls.push({
              id: attachment.id,
              markdownUrl: downloadedAttachmentUrl(attachment, confirmed.filename)
            });
            continue;
          }
          const completed = await downloads.download(
            {
              filename: attachment.outputPath,
              blob: serializedAttachmentContentToBlob(attachment.content, attachment.mimeType),
              mimeType: attachment.mimeType
            },
            requestOptions
          );
          request.check();
          if (completed.state !== 'complete') {
            throw new Error('Download completion cannot be confirmed.');
          }
          progress?.confirmed.push({
            id: attachment.id,
            outputPath: attachment.outputPath,
            download: { id: completed.id, filename: completed.filename }
          });
          downloadIds.push(completed.id);
          attachmentUrls.push({
            id: attachment.id,
            markdownUrl: downloadedAttachmentUrl(attachment, completed.filename)
          });
        }
      });
    }
    return completeStage('write_markdown', async () => {
      request.check();
      const completed = await downloads.download(
        {
          filename: input.filePath,
          content: replaceClipAttachmentReferences(input.sourceMarkdown, attachmentUrls),
          mimeType: 'text/markdown;charset=utf-8'
        },
        requestOptions
      );
      request.check();
      if (completed.state !== 'complete') {
        throw new Error('Download completion cannot be confirmed.');
      }
      downloadIds.push(completed.id);
      return { filePath: completed.filename, downloadId: completed.id, downloadIds };
    });
  });
}
