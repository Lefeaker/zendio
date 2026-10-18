import type { DownloadsService } from '../../platform/interfaces/downloads';
import { serializedAttachmentContentToBlob } from '../../shared/attachments/clipAttachmentBinary';
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
  const relativePath = `${directory}${actualName}`;
  if (normalized !== relativePath && !normalized.endsWith(`/${relativePath}`)) {
    throw new Error('Downloaded attachment moved outside its requested folder.');
  }
  if (actualName === attachment.fileName) return attachment.markdownUrl;
  const encodedName = encodeURIComponent(actualName).replace(
    /[()]/gu,
    (value) => `%${value.charCodeAt(0).toString(16).toUpperCase()}`
  );
  const escapedName = attachment.fileName.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  // Only rename file leaves, including generated-filename query values. A folder may
  // itself have the original filename, and must not be renamed with the attachment.
  return attachment.markdownUrl.replace(
    new RegExp(`(^|[/=?&])${escapedName}(?=$|[?#&])`, 'gu'),
    (_match, prefix: string) => `${prefix}${encodedName}`
  );
}

export async function downloadPreparedClip(input: {
  downloads: DownloadsService;
  filePath: string;
  sourceMarkdown: string;
  prepared: PreparedClipAttachments;
  completeStage: <T>(stage: WriteStage, action: () => Promise<T>) => Promise<T>;
}): Promise<{
  filePath: string;
  downloadId: number | string;
  downloadIds: Array<number | string>;
}> {
  const { downloads, prepared, completeStage } = input;
  const downloadIds: Array<number | string> = [];
  let markdown = input.sourceMarkdown;
  if (prepared.attachments.length) {
    await completeStage('write_attachments', async () => {
      for (const attachment of prepared.attachments) {
        const completed = await downloads.download({
          filename: attachment.outputPath,
          blob: serializedAttachmentContentToBlob(attachment.content, attachment.mimeType),
          mimeType: attachment.mimeType
        });
        if (completed.state !== 'complete') {
          throw new Error('Download completion cannot be confirmed.');
        }
        downloadIds.push(completed.id);
        markdown = markdown
          .split(`aiob-attachment:${attachment.id}`)
          .join(downloadedAttachmentUrl(attachment, completed.filename));
      }
    });
  }
  return completeStage('write_markdown', async () => {
    const completed = await downloads.download({
      filename: input.filePath,
      content: markdown,
      mimeType: 'text/markdown;charset=utf-8'
    });
    if (completed.state !== 'complete') {
      throw new Error('Download completion cannot be confirmed.');
    }
    downloadIds.push(completed.id);
    return { filePath: completed.filename, downloadId: completed.id, downloadIds };
  });
}
