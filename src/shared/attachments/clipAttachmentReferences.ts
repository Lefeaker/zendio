type AttachmentReference = { id: string; markdownUrl: string };

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

/** Only the producer's inline Markdown destination is reserved; prose is untouched. */
export function replaceClipAttachmentReferences(
  markdown: string,
  attachments: readonly AttachmentReference[]
): string {
  if (attachments.length === 0) return markdown;
  const urls = new Map(attachments.map((attachment) => [attachment.id, attachment.markdownUrl]));
  // Longer IDs first also preserve historical IDs containing Markdown punctuation.
  const ids = [...urls.keys()]
    .sort((a, b) => b.length - a.length)
    .map((id) => id.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'))
    .join('|');
  return markdown.replace(
    new RegExp(`(\\]\\()aiob-attachment:(${ids})(\\))`, 'gu'),
    (_match, opening: string, id: string, closing: string) => `${opening}${urls.get(id)}${closing}`
  );
}

export function hasUnresolvedClipAttachmentReferences(
  markdown: string,
  attachments: readonly { id: string }[]
): boolean {
  const resolved = replaceClipAttachmentReferences(
    markdown,
    attachments.map(({ id }) => ({
      id,
      markdownUrl: 'resolved-attachment'
    }))
  );
  return /\]\(aiob-attachment:[^\r\n]*\)/u.test(resolved);
}
