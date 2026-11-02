import type { BinaryClipAttachment } from '../types/clip';
import { isObjectRecord } from '../guards';
import {
  isSerializedClipAttachmentBinaryContent,
  isValidSerializedClipAttachmentBinaryContent,
  serializeBlobAttachmentContent
} from './clipAttachmentBinary';

export const AI_CHAT_IMAGE_MAX_BYTES = 15 * 1024 * 1024;
export const AI_CHAT_IMAGE_MAX_BASE64_LENGTH = 20 * 1024 * 1024;
export const AI_CHAT_IMAGE_TIMEOUT_MS = 30_000;

export class AIChatImageResourceError extends Error {
  constructor(
    readonly code: string,
    readonly status?: number
  ) {
    super(code);
    this.name = 'AIChatImageResourceError';
  }
}

const IMAGE_EXTENSIONS: Readonly<Record<string, string>> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'image/svg+xml': 'svg'
};
const SVG_ELEMENTS = new Set(
  'svg g path rect circle ellipse line polyline polygon text tspan textPath title desc metadata defs clipPath mask linearGradient radialGradient stop use marker pattern symbol switch view filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feImage feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence'.split(
    ' '
  )
);
const SVG_STYLE_PROPERTIES = new Set(
  'fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-miterlimit stroke-dasharray stroke-dashoffset opacity color color-interpolation color-interpolation-filters flood-color flood-opacity lighting-color stop-color stop-opacity filter clip-path clip-rule mask marker marker-start marker-mid marker-end display visibility overflow font-family font-size font-style font-weight font-stretch font-variant letter-spacing word-spacing text-anchor text-decoration dominant-baseline alignment-baseline baseline-shift direction writing-mode transform transform-origin vector-effect paint-order shape-rendering text-rendering image-rendering'.split(
    ' '
  )
);
const XML_ENTITIES: Readonly<Record<string, string>> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'"
};

function decodeSvgEntities(text: string): string | undefined {
  if (/&(?!(?:amp|lt|gt|quot|apos|#[0-9]+|#x[0-9a-fA-F]+);)/u.test(text)) return undefined;
  let valid = true;
  const decoded = text.replace(/&([^;]+);/gu, (_entity: string, name: string) => {
    if (!name.startsWith('#')) return XML_ENTITIES[name];
    const code = name[1] === 'x' ? Number.parseInt(name.slice(2), 16) : Number(name.slice(1));
    if (
      ![9, 10, 13].includes(code) &&
      !(code >= 32 && code <= 0xd7ff) &&
      !(code >= 0xe000 && code <= 0xfffd) &&
      !(code >= 0x10000 && code <= 0x10ffff)
    ) {
      valid = false;
      return '';
    }
    return String.fromCodePoint(code);
  });
  return valid ? decoded : undefined;
}

function staticSvgValue(value: string): boolean {
  if (
    /[\\<{}@]/u.test(value) ||
    /\/\*|\*\/|(?:expression|var|env|image-set|paint)\s*\(/iu.test(value)
  )
    return false;
  const withoutLocalUrls = value.replace(
    /url\(\s*(?:#[A-Za-z_][\w:.-]*|"#[A-Za-z_][\w:.-]*"|'#[A-Za-z_][\w:.-]*')\s*\)/giu,
    ''
  );
  return !/url\s*\(/iu.test(withoutLocalUrls);
}

function staticSvgStyle(value: string): boolean {
  return value.split(';').every((declaration) => {
    if (!declaration.trim()) return true;
    const separator = declaration.indexOf(':');
    return (
      separator > 0 &&
      SVG_STYLE_PROPERTIES.has(declaration.slice(0, separator).trim().toLowerCase()) &&
      staticSvgValue(declaration.slice(separator + 1))
    );
  });
}

export function isAIChatImageMime(mime: string): boolean {
  return Object.prototype.hasOwnProperty.call(IMAGE_EXTENSIONS, mime);
}

function safeSvg(bytes: Uint8Array): boolean {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return false;
  }
  text = text
    .replace(/^\uFEFF/u, '')
    .replace(/^\s*<\?xml\s[^?]*\?>/u, '')
    .replace(/<!--[\s\S]*?-->/gu, '');
  if (/<!|<\?/u.test(text) || decodeSvgEntities(text) === undefined) return false;
  const stack: string[] = [];
  let offset = 0;
  let roots = 0;
  for (const match of text.matchAll(/<(\/?)([A-Za-z][\w:.-]*)([^<>]*?)(\/?)>/gu)) {
    const between = text.slice(offset, match.index);
    if (between.includes('<') || (stack.length === 0 && between.trim())) return false;
    offset = match.index + match[0].length;
    const [, closing, tag, attributes, selfClosing] = match;
    if (!SVG_ELEMENTS.has(tag)) return false;
    if (closing) {
      if (attributes.trim() || selfClosing || stack.pop() !== tag) return false;
      continue;
    }
    if (stack.length === 0 && (tag !== 'svg' || ++roots !== 1)) return false;
    let end = 0;
    const names = new Set<string>();
    for (const attribute of attributes.matchAll(
      /\s+([A-Za-z_][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/gu
    )) {
      if (attribute.index !== end) return false;
      end = attribute.index + attribute[0].length;
      const name = attribute[1];
      const value = decodeSvgEntities(attribute[2] ?? attribute[3] ?? '');
      if (value === undefined || names.has(name) || /^on/iu.test(name) || name === 'xml:base')
        return false;
      names.add(name);
      if (
        name.includes(':') &&
        !['xmlns:xlink', 'xlink:href', 'xml:lang', 'xml:space'].includes(name)
      )
        return false;
      if (name === 'style' && !staticSvgStyle(value)) return false;
      if ((name === 'href' || name === 'xlink:href') && !/^#[A-Za-z_][\w:.-]*$/u.test(value))
        return false;
      if (!staticSvgValue(value)) return false;
    }
    if (attributes.slice(end).trim()) return false;
    if (!selfClosing) stack.push(tag);
  }
  return roots === 1 && stack.length === 0 && !text.slice(offset).trim();
}

function imageMime(bytes: Uint8Array): string | undefined {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));
  if (
    bytes.length >= 45 &&
    bytes[0] === 137 &&
    ascii(1, 8) === 'PNG\r\n\x1a\n' &&
    ascii(12, 16) === 'IHDR' &&
    ascii(bytes.length - 8, bytes.length - 4) === 'IEND'
  )
    return 'image/png';
  if (
    bytes.length >= 4 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255 &&
    bytes.at(-2) === 255 &&
    bytes.at(-1) === 217
  )
    return 'image/jpeg';
  if (bytes.length >= 14 && /^GIF8[79]a$/u.test(ascii(0, 6)) && bytes.at(-1) === 59)
    return 'image/gif';
  if (
    bytes.length >= 20 &&
    ascii(0, 4) === 'RIFF' &&
    ascii(8, 12) === 'WEBP' &&
    /^VP8[ LX]$/u.test(ascii(12, 16))
  ) {
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(4, true);
    if (size + 8 === bytes.length) return 'image/webp';
  }
  if (bytes.length >= 16 && ascii(4, 8) === 'ftyp') {
    const size = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0);
    if (size >= 16 && size <= bytes.length && size % 4 === 0) {
      const brands = [ascii(8, 12)];
      for (let offset = 16; offset < size; offset += 4) brands.push(ascii(offset, offset + 4));
      if (brands.some((brand) => brand === 'avif' || brand === 'avis')) return 'image/avif';
    }
  }
  if (safeSvg(bytes)) return 'image/svg+xml';
  return undefined;
}

export async function createAIChatImageAttachment(
  bytes: Uint8Array,
  declaredMime: string | null,
  signal: AbortSignal
): Promise<BinaryClipAttachment> {
  signal.throwIfAborted();
  if (bytes.length === 0 || bytes.length > AI_CHAT_IMAGE_MAX_BYTES)
    throw new AIChatImageResourceError('AI_CHAT_IMAGE_SIZE');
  const mimeType = imageMime(bytes);
  const declared = declaredMime?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (!mimeType || (declared && declared !== 'application/octet-stream' && declared !== mimeType))
    throw new AIChatImageResourceError('AI_CHAT_IMAGE_MIME');
  const buffer = new ArrayBuffer(bytes.length);
  new Uint8Array(buffer).set(bytes);
  const hash = await crypto.subtle.digest('SHA-256', buffer);
  signal.throwIfAborted();
  const id = `ai-image-${Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, '0')).join('')}`;
  const content = await serializeBlobAttachmentContent(new Blob([buffer], { type: mimeType }));
  signal.throwIfAborted();
  if (content.data.length > AI_CHAT_IMAGE_MAX_BASE64_LENGTH)
    throw new AIChatImageResourceError('AI_CHAT_IMAGE_SIZE');
  return { id, fileName: `${id}.${IMAGE_EXTENSIONS[mimeType]}`, mimeType, content };
}

/** Redirected responses require the transport to validate the final URL first. */
export async function readAIChatImageResponse(
  response: Response,
  signal: AbortSignal,
  allowRedirected = false
): Promise<BinaryClipAttachment> {
  signal.throwIfAborted();
  const cancelBody = () => {
    void response.body?.cancel().catch(() => undefined);
  };
  if (
    (response.redirected && !allowRedirected) ||
    response.type === 'opaqueredirect' ||
    (response.status >= 300 && response.status < 400)
  ) {
    cancelBody();
    throw new AIChatImageResourceError('AI_CHAT_IMAGE_REDIRECT');
  }
  if (response.type === 'opaque') {
    cancelBody();
    throw new AIChatImageResourceError('AI_CHAT_IMAGE_BODY');
  }
  if (!response.ok) {
    cancelBody();
    throw new AIChatImageResourceError('AI_CHAT_IMAGE_HTTP', response.status);
  }
  const declared = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
  if (declared && declared !== 'application/octet-stream' && !isAIChatImageMime(declared)) {
    cancelBody();
    throw new AIChatImageResourceError('AI_CHAT_IMAGE_MIME');
  }
  if (Number(response.headers.get('content-length')) > AI_CHAT_IMAGE_MAX_BYTES) {
    cancelBody();
    throw new AIChatImageResourceError('AI_CHAT_IMAGE_SIZE');
  }
  if (!response.body) throw new AIChatImageResourceError('AI_CHAT_IMAGE_BODY');
  const reader = response.body.getReader();
  let abort = () => {};
  const cancelled = new Promise<never>((_resolve, reject) => {
    abort = () => {
      void reader.cancel().catch(() => undefined);
      reject(signal.reason);
    };
  });
  void cancelled.catch(() => undefined);
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      signal.throwIfAborted();
      const next = await Promise.race([reader.read(), cancelled]);
      signal.throwIfAborted();
      if (next.done) break;
      size += next.value.byteLength;
      if (size > AI_CHAT_IMAGE_MAX_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new AIChatImageResourceError('AI_CHAT_IMAGE_SIZE');
      }
      chunks.push(next.value);
    }
  } finally {
    signal.removeEventListener('abort', abort);
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return createAIChatImageAttachment(bytes, response.headers.get('content-type'), signal);
}

export function assertAIChatImageAttachment(value: unknown): asserts value is BinaryClipAttachment {
  if (
    !isObjectRecord(value) ||
    typeof value.id !== 'string' ||
    !/^ai-image-[a-f0-9]{64}$/u.test(value.id) ||
    typeof value.mimeType !== 'string' ||
    !isAIChatImageMime(value.mimeType) ||
    value.fileName !== `${value.id}.${IMAGE_EXTENSIONS[value.mimeType]}` ||
    !isSerializedClipAttachmentBinaryContent(value.content) ||
    value.content.data.length > AI_CHAT_IMAGE_MAX_BASE64_LENGTH ||
    value.content.byteLength === 0 ||
    value.content.byteLength > AI_CHAT_IMAGE_MAX_BYTES ||
    !isValidSerializedClipAttachmentBinaryContent(value.content)
  )
    throw new AIChatImageResourceError('AI_CHAT_IMAGE_INVALID_REPLY');
}
