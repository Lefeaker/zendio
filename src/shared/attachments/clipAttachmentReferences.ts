import {
  attachmentCodeSpanEnds,
  attachmentRawHtmlEnd,
  attachmentInlineBlocks
} from './clipAttachmentMarkdown';
import { AttachmentLinkSyntax, ATTACHMENT_ESCAPABLE } from './clipAttachmentLinks';

type AttachmentReference = { id: string; markdownUrl: string };
const PREFIX = '(aiob-attachment:';

/** Shared recognition boundary for validation and both planned/native URL replacement. */
function* attachmentDestinations(markdown: string, ids: readonly string[]) {
  if (!markdown.includes(PREFIX)) return;
  const references = new Set<string>();
  const blocks = [];
  for (const block of attachmentInlineBlocks(markdown)) {
    const hasMarker = markdown.slice(block.start, block.end).includes(PREFIX);
    if (!hasMarker && block.referenceStarts.size === 0) continue;
    const links = new AttachmentLinkSyntax(markdown, block);
    const start = links.definitionsEnd(references);
    // Forward definitions need their labels, not retained indexes for unrelated prose.
    if (hasMarker) blocks.push({ block, links, start });
  }
  for (const { block, links, start } of blocks) {
    const codeEnds = attachmentCodeSpanEnds(markdown, { start, end: block.end });
    const htmlClosers = new Map<string, number>();
    const brackets: { start: number; image: boolean; linkVersion: number }[] = [];
    let linkVersion = 0;
    for (let index = start; index < block.end; index++) {
      const character = markdown[index];
      if (character === '\\' && ATTACHMENT_ESCAPABLE.test(markdown[index + 1] ?? '')) {
        index++;
      } else if (character === '`') {
        const end = codeEnds.get(index);
        if (end !== undefined) index = end - 1;
        else while (markdown[index + 1] === '`') index++;
      } else if (character === '<') {
        const autolink = links.autolinkEnd(index);
        if (autolink !== undefined) linkVersion++;
        const end = autolink ?? attachmentRawHtmlEnd(markdown, index, block.end, htmlClosers);
        if (end !== undefined && end <= block.end) index = end - 1;
      } else if (character === '[') {
        brackets.push({
          start: index,
          image: markdown[index - 1] === '!' && !links.escaped.has(index - 1),
          linkVersion
        });
      } else if (character === ']') {
        const opener = brackets.pop();
        if (!opener || (!opener.image && opener.linkVersion !== linkVersion)) continue;
        if (!markdown.startsWith(PREFIX, index + 1)) {
          const end =
            links.inlineEnd(index + 1) ?? links.referenceEnd(opener.start, index, references);
          if (end !== undefined) {
            index = end - 1;
            if (!opener.image) linkVersion++;
          }
          continue;
        }
        const start = index + 2;
        const idStart = index + 1 + PREFIX.length;
        // Match the complete map first: historical IDs may themselves contain ')'.
        const id = ids.find(
          (candidate) =>
            markdown.startsWith(`${candidate})`, idStart) && idStart + candidate.length < block.end
        );
        let end = idStart + (id?.length ?? 0);
        if (id === undefined) {
          while (end < block.end && !/[\r\n)]/u.test(markdown[end])) {
            if (markdown[end] === '\\' && ATTACHMENT_ESCAPABLE.test(markdown[end + 1] ?? '')) end++;
            end++;
          }
        }
        if (markdown[end] === ')') {
          yield { start, end, id };
          if (!opener.image) linkVersion++;
        }
        index = end;
      }
    }
  }
}

/** Encode generated relative URLs without changing the physical attachment path. */
export function encodeAttachmentMarkdownPath(path: string): string {
  return path
    .split('/')
    .map((segment) =>
      encodeURIComponent(segment).replace(
        /[!'()*]/gu,
        (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
      )
    )
    .join('/');
}

/** Replace only producer destinations; all other source bytes remain untouched. */
export function replaceClipAttachmentReferences(
  markdown: string,
  attachments: readonly AttachmentReference[]
): string {
  if (attachments.length === 0) return markdown;
  const urls = new Map(attachments.map((attachment) => [attachment.id, attachment.markdownUrl]));
  const ids = [...urls.keys()].sort((a, b) => b.length - a.length);
  const parts: string[] = [];
  let copied = 0;
  for (const { start, end, id } of attachmentDestinations(markdown, ids)) {
    const url = id === undefined ? undefined : urls.get(id);
    if (url === undefined) continue;
    parts.push(markdown.slice(copied, start), url);
    copied = end;
  }
  if (copied === 0) return markdown;
  parts.push(markdown.slice(copied));
  return parts.join('');
}

export function hasUnresolvedClipAttachmentReferences(
  markdown: string,
  attachments: readonly { id: string }[]
): boolean {
  const ids = attachments.map(({ id }) => id).sort((a, b) => b.length - a.length);
  for (const reference of attachmentDestinations(markdown, ids)) {
    if (reference.id === undefined) return true;
  }
  return false;
}
