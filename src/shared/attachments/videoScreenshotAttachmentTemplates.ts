import { sanitizeDownloadsPathSegment } from '../downloadsFilename';
import { normalizeVaultRelativePath } from '../paths/vaultRelativePath';

export const DEFAULT_VIDEO_SCREENSHOT_ATTACHMENT_LOCATION_TEMPLATE = './assets/${noteFileName}';
export const DEFAULT_VIDEO_SCREENSHOT_ATTACHMENT_FILE_NAME_TEMPLATE =
  "file-${date:{momentJsFormat:'YYYYMMDDHHmmssSSS'}}.jpg";
export const DEFAULT_VIDEO_SCREENSHOT_ATTACHMENT_MARKDOWN_URL_FORMAT = '';

export interface VideoScreenshotAttachmentTemplateOptions {
  locationTemplate: string;
  fileNameTemplate: string;
  markdownUrlFormat: string;
}

export interface VideoScreenshotAttachmentTemplateContext {
  noteFilePath: string;
  originalAttachmentFileName: string;
  capturedAt: number;
  attachmentIndex: number;
}

export interface ResolvedVideoScreenshotAttachmentTemplate {
  outputPath: string;
  markdownPath: string;
  markdownUrl: string;
  generatedFileName: string;
  generatedAttachmentFilePath: string;
  usedFallback: boolean;
  warnings: string[];
}

interface TemplateTokenContext {
  noteFileName: string;
  noteFilePath: string;
  noteFolderPath: string;
  noteFolderName: string;
  originalAttachmentFileName: string;
  originalAttachmentFileExtension: string;
  generatedAttachmentFileName?: string;
  generatedAttachmentFilePath?: string;
  capturedAt: number;
}

interface TemplateRenderResult {
  value: string;
  warning?: string;
  usedFallback: boolean;
}

const GENERATED_ATTACHMENT_FILE_NAME_TOKEN = 'generatedattachmentfilename';
const GENERATED_ATTACHMENT_FILE_PATH_TOKEN = 'generatedattachmentfilepath';
const TEMPLATE_TOKEN_PATTERN = /\$\{/u;
const IMAGE_EXTENSION_PATTERN = /\.jpg$/iu;

export function resolveVideoScreenshotAttachmentTemplate(
  options: VideoScreenshotAttachmentTemplateOptions,
  context: VideoScreenshotAttachmentTemplateContext
): ResolvedVideoScreenshotAttachmentTemplate {
  const tokenContext = createTemplateTokenContext(context);
  const locationResolution = resolveLocationTemplate(options.locationTemplate, tokenContext);
  const fileNameResolution = resolveFileNameTemplate(options.fileNameTemplate, tokenContext);
  const generatedAttachmentFilePath = joinVaultPath(
    locationResolution.value,
    fileNameResolution.value
  );
  const markdownPath = toMarkdownPath(tokenContext.noteFilePath, generatedAttachmentFilePath);
  const markdownTokenContext: TemplateTokenContext = {
    ...tokenContext,
    generatedAttachmentFileName: fileNameResolution.value,
    generatedAttachmentFilePath
  };
  const markdownUrlResolution = resolveMarkdownUrlFormat(
    options.markdownUrlFormat,
    markdownPath,
    markdownTokenContext
  );
  const warnings = [
    locationResolution.warning,
    fileNameResolution.warning,
    markdownUrlResolution.warning
  ].filter((warning): warning is string => typeof warning === 'string');

  return {
    outputPath: generatedAttachmentFilePath,
    markdownPath,
    markdownUrl: markdownUrlResolution.value,
    generatedFileName: fileNameResolution.value,
    generatedAttachmentFilePath,
    usedFallback:
      locationResolution.usedFallback ||
      fileNameResolution.usedFallback ||
      markdownUrlResolution.usedFallback,
    warnings
  };
}

export function disambiguateResolvedVideoScreenshotAttachmentTemplate(
  resolved: ResolvedVideoScreenshotAttachmentTemplate,
  occurrence: number
): ResolvedVideoScreenshotAttachmentTemplate {
  if (!Number.isInteger(occurrence) || occurrence <= 1) {
    return resolved;
  }

  const nextFileName = appendOccurrenceSuffix(resolved.generatedFileName, occurrence);
  const nextOutputPath = replaceLastSegment(resolved.outputPath, nextFileName);
  const nextMarkdownPath = replaceLastSegment(resolved.markdownPath, nextFileName);
  const nextMarkdownUrl = replaceExactValue(
    replaceExactValue(
      replaceExactValue(resolved.markdownUrl, resolved.generatedAttachmentFilePath, nextOutputPath),
      resolved.markdownPath,
      nextMarkdownPath
    ),
    resolved.generatedFileName,
    nextFileName
  );

  return {
    ...resolved,
    outputPath: nextOutputPath,
    markdownPath: nextMarkdownPath,
    markdownUrl: nextMarkdownUrl,
    generatedFileName: nextFileName,
    generatedAttachmentFilePath: nextOutputPath
  };
}

function createTemplateTokenContext(
  context: VideoScreenshotAttachmentTemplateContext
): TemplateTokenContext {
  const noteFilePath = normalizeVaultRelativePath(context.noteFilePath);
  const noteSegments = splitVaultPath(noteFilePath);
  const noteFile = noteSegments.at(-1) ?? 'note.md';
  const noteFolderSegments = noteSegments.slice(0, -1);
  const originalAttachmentFile = sanitizeRawFileName(context.originalAttachmentFileName);
  const originalExtension = getFileExtension(originalAttachmentFile);

  return {
    noteFileName: sanitizeDownloadsPathSegment(stripFileExtension(noteFile), 'note'),
    noteFilePath,
    noteFolderPath: noteFolderSegments.join('/'),
    noteFolderName:
      noteFolderSegments.length > 0
        ? sanitizeDownloadsPathSegment(noteFolderSegments.at(-1), 'attachments')
        : '',
    originalAttachmentFileName: sanitizeDownloadsPathSegment(
      stripFileExtension(originalAttachmentFile),
      'attachment'
    ),
    originalAttachmentFileExtension: originalExtension,
    capturedAt: context.capturedAt
  };
}

function resolveLocationTemplate(
  template: string,
  context: TemplateTokenContext
): TemplateRenderResult {
  return withTemplateFallback(
    'locationTemplate',
    template,
    DEFAULT_VIDEO_SCREENSHOT_ATTACHMENT_LOCATION_TEMPLATE,
    (value) => renderLocationTemplate(value, context)
  );
}

function resolveFileNameTemplate(
  template: string,
  context: TemplateTokenContext
): TemplateRenderResult {
  return withTemplateFallback(
    'fileNameTemplate',
    template,
    DEFAULT_VIDEO_SCREENSHOT_ATTACHMENT_FILE_NAME_TEMPLATE,
    (value) => renderFileNameTemplate(value, context)
  );
}

function resolveMarkdownUrlFormat(
  template: string,
  fallbackMarkdownPath: string,
  context: TemplateTokenContext
): TemplateRenderResult {
  const trimmedTemplate = template.trim();
  if (trimmedTemplate.length === 0) {
    return {
      value: fallbackMarkdownPath,
      usedFallback: false
    };
  }

  return withTemplateFallback(
    'markdownUrlFormat',
    trimmedTemplate,
    DEFAULT_VIDEO_SCREENSHOT_ATTACHMENT_MARKDOWN_URL_FORMAT,
    (value) => renderMarkdownUrlFormat(value, fallbackMarkdownPath, context)
  );
}

function withTemplateFallback(
  fieldName: string,
  template: string,
  fallbackTemplate: string,
  render: (candidate: string) => string
): TemplateRenderResult {
  try {
    return {
      value: render(template),
      usedFallback: false
    };
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown template error.';
    const warning = `${fieldName} fell back to default template: ${reason}`;
    if (fallbackTemplate.length === 0) {
      return {
        value: '',
        warning,
        usedFallback: true
      };
    }

    return {
      value: render(fallbackTemplate),
      warning,
      usedFallback: true
    };
  }
}

function renderLocationTemplate(template: string, context: TemplateTokenContext): string {
  const rendered = renderTemplate(template, context, 'locationTemplate').trim();
  if (rendered.length === 0) {
    throw new Error('Rendered locationTemplate is empty.');
  }
  if (isAbsolutePath(rendered)) {
    throw new Error(`locationTemplate must not resolve to an absolute path: ${rendered}`);
  }

  const normalized = rendered.replace(/\\/gu, '/');
  if (normalized === '.' || normalized === './') {
    if (context.noteFolderPath.length === 0) {
      throw new Error('locationTemplate resolved to an empty note-folder path.');
    }
    return context.noteFolderPath;
  }

  const resolved = normalized.startsWith('./')
    ? joinVaultPath(context.noteFolderPath, normalized.slice(2))
    : normalized;

  if (resolved.trim().length === 0) {
    throw new Error('Rendered locationTemplate is empty.');
  }

  const vaultRelativePath = normalizeVaultRelativePath(resolved);
  return sanitizeVaultRelativePath(vaultRelativePath);
}

function renderFileNameTemplate(template: string, context: TemplateTokenContext): string {
  const rendered = renderTemplate(template, context, 'fileNameTemplate');
  const safeBaseName = sanitizeDownloadsPathSegment(
    rendered.replace(/[\\/]+/gu, '_').trim(),
    'attachment'
  );
  return IMAGE_EXTENSION_PATTERN.test(safeBaseName) ? safeBaseName : `${safeBaseName}.jpg`;
}

function renderMarkdownUrlFormat(
  template: string,
  fallbackMarkdownPath: string,
  context: TemplateTokenContext
): string {
  const rendered = renderTemplate(template, context, 'markdownUrlFormat').trim();
  if (rendered.length === 0) {
    return fallbackMarkdownPath;
  }
  if (looksLikeEmbeddedMarkdown(rendered)) {
    throw new Error('markdownUrlFormat must resolve to a URL fragment, not a full embed.');
  }
  return rendered;
}

function renderTemplate(
  template: string,
  context: TemplateTokenContext,
  fieldName: string
): string {
  if (template.trim().length === 0) {
    throw new Error(`${fieldName} must not be empty.`);
  }

  let cursor = 0;
  let rendered = '';

  while (cursor < template.length) {
    const nextTokenStart = template.indexOf('${', cursor);
    if (nextTokenStart === -1) {
      rendered += template.slice(cursor);
      break;
    }

    rendered += template.slice(cursor, nextTokenStart);
    const nextTokenEnd = findTokenEnd(template, nextTokenStart + 2);
    if (nextTokenEnd === -1) {
      throw new Error(`${fieldName} contains an unclosed token.`);
    }
    const token = template.slice(nextTokenStart + 2, nextTokenEnd);
    rendered += resolveTemplateToken(token, context, fieldName);
    cursor = nextTokenEnd + 1;
  }

  if (TEMPLATE_TOKEN_PATTERN.test(rendered)) {
    throw new Error(`${fieldName} contains an unresolved token.`);
  }

  return rendered;
}

function findTokenEnd(template: string, startIndex: number): number {
  let depth = 1;
  let quote: '"' | "'" | null = null;

  for (let index = startIndex; index < template.length; index += 1) {
    const character = template[index];
    if (quote) {
      if (character === quote && template[index - 1] !== '\\') {
        quote = null;
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === '{') {
      depth += 1;
      continue;
    }

    if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }

  return -1;
}

function resolveTemplateToken(
  token: string,
  context: TemplateTokenContext,
  fieldName: string
): string {
  const normalizedToken = token.replace(/\s+/gu, '').toLowerCase();

  switch (normalizedToken) {
    case 'notefilename':
      return context.noteFileName;
    case 'notefilepath':
      return context.noteFilePath;
    case 'notefolderpath':
      return context.noteFolderPath;
    case 'notefoldername':
      return context.noteFolderName;
    case 'originalattachmentfilename':
      return context.originalAttachmentFileName;
    case 'originalattachmentfileextension':
      return context.originalAttachmentFileExtension;
    case GENERATED_ATTACHMENT_FILE_NAME_TOKEN:
      if (context.generatedAttachmentFileName === undefined) {
        throw new Error(
          `${fieldName} cannot use \${generatedAttachmentFileName} before the filename is resolved.`
        );
      }
      return context.generatedAttachmentFileName;
    case GENERATED_ATTACHMENT_FILE_PATH_TOKEN:
      if (context.generatedAttachmentFilePath === undefined) {
        throw new Error(
          `${fieldName} cannot use \${generatedAttachmentFilePath} before the path is resolved.`
        );
      }
      return context.generatedAttachmentFilePath;
    default:
      if (normalizedToken.startsWith('date:')) {
        return resolveDateToken(token, context.capturedAt);
      }
      throw new Error(`${fieldName} contains unsupported token ${token.trim()}.`);
  }
}

function resolveDateToken(token: string, capturedAt: number): string {
  const match = token.match(/^date\s*:\s*\{\s*momentJsFormat\s*:\s*(['"])(.*?)\1\s*\}\s*$/iu);
  if (!match) {
    throw new Error(
      `Date token ${token.trim()} is invalid. Only momentJsFormat is supported in date tokens.`
    );
  }

  return formatCapturedAt(capturedAt, match[2]);
}

function formatCapturedAt(capturedAt: number, format: string): string {
  const date = new Date(capturedAt);
  const replacements: Record<string, string> = {
    YYYY: String(date.getFullYear()),
    YY: String(date.getFullYear()).slice(-2),
    MM: padNumber(date.getMonth() + 1, 2),
    M: String(date.getMonth() + 1),
    DD: padNumber(date.getDate(), 2),
    D: String(date.getDate()),
    HH: padNumber(date.getHours(), 2),
    H: String(date.getHours()),
    mm: padNumber(date.getMinutes(), 2),
    m: String(date.getMinutes()),
    ss: padNumber(date.getSeconds(), 2),
    s: String(date.getSeconds()),
    SSS: padNumber(date.getMilliseconds(), 3)
  };

  return format.replace(/YYYY|SSS|YY|MM|M|DD|D|HH|H|mm|m|ss|s/gu, (token) => replacements[token]);
}

function padNumber(value: number, size: number): string {
  return String(value).padStart(size, '0');
}

function sanitizeVaultRelativePath(input: string): string {
  const safeSegments = splitVaultPath(input).map((segment) =>
    sanitizeDownloadsPathSegment(segment, 'attachments')
  );
  return safeSegments.join('/');
}

function toMarkdownPath(noteFilePath: string, outputPath: string): string {
  const noteDirectorySegments = splitVaultPath(noteFilePath).slice(0, -1);
  const outputSegments = splitVaultPath(outputPath);
  let sharedIndex = 0;

  while (
    sharedIndex < noteDirectorySegments.length &&
    sharedIndex < outputSegments.length &&
    noteDirectorySegments[sharedIndex] === outputSegments[sharedIndex]
  ) {
    sharedIndex += 1;
  }

  const segments = [
    ...Array.from({ length: noteDirectorySegments.length - sharedIndex }, () => '..'),
    ...outputSegments.slice(sharedIndex)
  ];
  return segments.join('/');
}

function splitVaultPath(path: string): string[] {
  return path
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function joinVaultPath(...segments: string[]): string {
  return segments
    .flatMap((segment) => segment.split(/[\\/]+/u))
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0)
    .join('/');
}

function sanitizeRawFileName(fileName: string): string {
  const candidate = fileName
    .split(/[\\/]+/u)
    .filter(Boolean)
    .at(-1);
  return sanitizeDownloadsPathSegment(candidate, 'attachment.jpg');
}

function stripFileExtension(fileName: string): string {
  return fileName.replace(/\.[^.]+$/u, '');
}

function getFileExtension(fileName: string): string {
  const match = fileName.match(/\.([^.]+)$/u);
  return match?.[1] ?? '';
}

function looksLikeEmbeddedMarkdown(value: string): boolean {
  return /!\[[^\]]*\]\([^)]*\)/u.test(value) || /\[\[[^\]]+\]\]/u.test(value);
}

function isAbsolutePath(value: string): boolean {
  return value.startsWith('/') || /^[a-z]:[/\\]/iu.test(value) || value.startsWith('\\\\');
}

function appendOccurrenceSuffix(fileName: string, occurrence: number): string {
  const baseName = IMAGE_EXTENSION_PATTERN.test(fileName)
    ? fileName.replace(IMAGE_EXTENSION_PATTERN, '')
    : fileName;
  return `${baseName}-${occurrence}.jpg`;
}

function replaceLastSegment(path: string, nextFileName: string): string {
  const segments = splitVaultPath(path);
  if (segments.length === 0) {
    return nextFileName;
  }
  segments[segments.length - 1] = nextFileName;
  return segments.join('/');
}

function replaceExactValue(input: string, target: string, nextValue: string): string {
  return target.length === 0 ? input : input.split(target).join(nextValue);
}
