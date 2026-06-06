import {
  DEFAULT_VIDEO_SCREENSHOT_ATTACHMENT_FILE_NAME_TEMPLATE,
  DEFAULT_VIDEO_SCREENSHOT_ATTACHMENT_LOCATION_TEMPLATE,
  DEFAULT_VIDEO_SCREENSHOT_ATTACHMENT_MARKDOWN_URL_FORMAT,
  disambiguateResolvedVideoScreenshotAttachmentTemplate,
  resolveVideoScreenshotAttachmentTemplate
} from '../../shared/attachments/videoScreenshotAttachmentTemplates';
import { sanitizeDownloadsPathSegment } from '../../shared/downloadsFilename';
import { isObjectRecord } from '../../shared/guards';
import type { ClipMeta, ClipResultMessage } from '../../shared/types';
import type { VideoScreenshotAttachmentOptions } from '../../shared/types/options';
type ClipPayload = NonNullable<ClipResultMessage['payload']>;
type ClipAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  capturedAt?: number;
};

export type PreparedClipAttachment = {
  id: string;
  fileName: string;
  mimeType: string;
  dataUrl: string;
  outputPath: string;
  markdownPath: string;
  markdownUrl: string;
};

export type PreparedClipAttachments = {
  markdown: string;
  attachments: PreparedClipAttachment[];
};

type PrepareVideoClipAttachmentsOptions = {
  payload: ClipPayload;
  notePath: string;
  destination: 'vault' | 'downloads';
  screenshotAttachmentOptions?: VideoScreenshotAttachmentOptions;
};
const FILE_STEM_TIMESTAMP_PATTERN = /^file-(\d{17})$/u;
export function prepareVideoClipAttachments({
  payload,
  notePath,
  destination,
  screenshotAttachmentOptions
}: PrepareVideoClipAttachmentsOptions): PreparedClipAttachments {
  const attachments = parseClipAttachments(payload.meta?.attachments);
  if (attachments.length === 0) return { markdown: payload.markdown, attachments: [] };
  const preparedAttachments = shouldUseConfiguredVideoPlanning(
    payload,
    destination,
    screenshotAttachmentOptions
  )
    ? prepareConfiguredVideoAttachments(
        notePath,
        destination,
        attachments,
        payload,
        screenshotAttachmentOptions
      )
    : prepareLegacyAttachments(notePath, destination, attachments);
  return {
    markdown: replaceAttachmentMarkers(payload.markdown, preparedAttachments),
    attachments: preparedAttachments
  };
}
function shouldUseConfiguredVideoPlanning(
  payload: ClipPayload,
  destination: 'vault' | 'downloads',
  options?: VideoScreenshotAttachmentOptions
): options is VideoScreenshotAttachmentOptions {
  return Boolean(
    payload.type === 'video' &&
    options &&
    typeof options.locationTemplate === 'string' &&
    typeof options.fileNameTemplate === 'string' &&
    typeof options.markdownUrlFormat === 'string' &&
    (destination !== 'downloads' || !isDefaultScreenshotAttachmentOptions(options))
  );
}
function prepareConfiguredVideoAttachments(
  notePath: string,
  destination: 'vault' | 'downloads',
  attachments: ClipAttachment[],
  payload: ClipPayload,
  options: VideoScreenshotAttachmentOptions
): PreparedClipAttachment[] {
  const noteName = getFileStem(notePath);
  const occurrences = new Map<string, number>();
  const prepared = attachments.map((attachment, index) => {
    const baseResolved = resolveVideoScreenshotAttachmentTemplate(options, {
      noteFilePath: notePath,
      originalAttachmentFileName: attachment.fileName,
      capturedAt: resolveAttachmentCapturedAt(payload, attachment, index),
      attachmentIndex: index + 1
    });
    const key =
      destination === 'vault'
        ? baseResolved.generatedAttachmentFilePath
        : getDownloadPath(noteName, baseResolved.generatedFileName, attachments.length);
    const occurrence = (occurrences.get(key) ?? 0) + 1;
    occurrences.set(key, occurrence);
    return {
      attachment,
      resolved: disambiguateResolvedVideoScreenshotAttachmentTemplate(baseResolved, occurrence)
    };
  });
  if (destination === 'downloads' && prepared.some(({ resolved }) => resolved.usedFallback)) {
    return prepareLegacyAttachments(notePath, destination, attachments);
  }
  return prepared.map(({ attachment, resolved }) => ({
    id: attachment.id,
    fileName: resolved.generatedFileName,
    mimeType: attachment.mimeType,
    dataUrl: attachment.dataUrl,
    outputPath:
      destination === 'downloads'
        ? getDownloadPath(noteName, resolved.generatedFileName, attachments.length)
        : resolved.outputPath,
    markdownPath: resolved.markdownPath,
    markdownUrl: resolved.markdownUrl
  }));
}
function prepareLegacyAttachments(
  notePath: string,
  destination: 'vault' | 'downloads',
  attachments: ClipAttachment[]
): PreparedClipAttachment[] {
  const noteName = getFileStem(notePath);
  const noteDirectory = getDirectoryName(notePath);
  const occurrences = new Map<string, number>();
  return attachments.map((attachment) => {
    const fileName = sanitizeAttachmentFileName(attachment.fileName);
    const basePath =
      destination === 'downloads'
        ? getDownloadPath(noteName, fileName, attachments.length)
        : `assets/${noteName}/${fileName}`;
    const nextPath = disambiguatePath(basePath, occurrences);
    return {
      id: attachment.id,
      fileName: getLastPathSegment(nextPath),
      mimeType: attachment.mimeType,
      dataUrl: attachment.dataUrl,
      outputPath: destination === 'downloads' ? nextPath : joinPath(noteDirectory, nextPath),
      markdownPath: nextPath,
      markdownUrl: nextPath
    };
  });
}
function replaceAttachmentMarkers(markdown: string, attachments: PreparedClipAttachment[]): string {
  return attachments.reduce(
    (current, attachment) =>
      current.split(`aiob-attachment:${attachment.id}`).join(attachment.markdownUrl),
    markdown
  );
}
function parseClipAttachments(value: ClipMeta['attachments']): ClipAttachment[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): ClipAttachment[] => {
    if (!isObjectRecord(item)) return [];
    const candidate = item;
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
        dataUrl: candidate.dataUrl,
        ...(typeof candidate.capturedAt === 'number' && Number.isFinite(candidate.capturedAt)
          ? { capturedAt: candidate.capturedAt }
          : {})
      }
    ];
  });
}
function isDefaultScreenshotAttachmentOptions(options: VideoScreenshotAttachmentOptions): boolean {
  return (
    options.locationTemplate === DEFAULT_VIDEO_SCREENSHOT_ATTACHMENT_LOCATION_TEMPLATE &&
    options.fileNameTemplate === DEFAULT_VIDEO_SCREENSHOT_ATTACHMENT_FILE_NAME_TEMPLATE &&
    options.markdownUrlFormat === DEFAULT_VIDEO_SCREENSHOT_ATTACHMENT_MARKDOWN_URL_FORMAT
  );
}
function resolveAttachmentCapturedAt(
  payload: ClipPayload,
  attachment: ClipAttachment,
  attachmentIndex: number
): number {
  if (typeof attachment.capturedAt === 'number' && Number.isFinite(attachment.capturedAt)) {
    return attachment.capturedAt;
  }
  const fromFileName = parseCapturedAtFromFileName(attachment.fileName);
  if (fromFileName !== null) return fromFileName;
  const fromMeta = parseCapturedAtFromMeta(payload.meta?.createdAt);
  return fromMeta !== null ? fromMeta + attachmentIndex : attachmentIndex + 1;
}
function parseCapturedAtFromFileName(fileName: string): number | null {
  const stem = getLastPathSegment(fileName).replace(/\.[^.]+$/u, '');
  const match = FILE_STEM_TIMESTAMP_PATTERN.exec(stem);
  if (!match) return null;
  const [year, month, day, hour, minute, second, millisecond] = [
    match[1].slice(0, 4),
    match[1].slice(4, 6),
    match[1].slice(6, 8),
    match[1].slice(8, 10),
    match[1].slice(10, 12),
    match[1].slice(12, 14),
    match[1].slice(14, 17)
  ].map(Number);
  const capturedAt = new Date(year, month - 1, day, hour, minute, second, millisecond).getTime();
  return Number.isFinite(capturedAt) ? capturedAt : null;
}
function parseCapturedAtFromMeta(value: ClipMeta['createdAt']): number | null {
  if (typeof value !== 'string' || value.trim().length === 0) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function getDownloadPath(noteName: string, fileName: string, attachmentCount: number): string {
  return attachmentCount > 1 ? `${noteName}/${fileName}` : fileName;
}
function disambiguatePath(path: string, occurrences: Map<string, number>): string {
  const occurrence = (occurrences.get(path) ?? 0) + 1;
  occurrences.set(path, occurrence);
  if (occurrence <= 1) return path;
  const fileName = getLastPathSegment(path);
  const lastDotIndex = fileName.lastIndexOf('.');
  const nextFileName =
    lastDotIndex <= 0
      ? `${fileName}-${occurrence}`
      : `${fileName.slice(0, lastDotIndex)}-${occurrence}${fileName.slice(lastDotIndex)}`;
  return replaceLastPathSegment(path, nextFileName);
}
function replaceLastPathSegment(path: string, nextSegment: string): string {
  const segments = path.split('/').filter(Boolean);
  segments.splice(-1, 1, nextSegment);
  return segments.join('/');
}
function getLastPathSegment(path: string): string {
  return path.split(/[\\/]/u).filter(Boolean).at(-1) ?? path;
}
function getFileStem(filePath: string): string {
  return sanitizeDownloadsPathSegment(
    getLastPathSegment(filePath).replace(/\.[^.]+$/u, ''),
    'note'
  );
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
  return sanitizeDownloadsPathSegment(getLastPathSegment(fileName), 'attachment.jpg');
}
