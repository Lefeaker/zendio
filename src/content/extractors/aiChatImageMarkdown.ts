import {
  countClipAttachmentReferences,
  replaceClipAttachmentReferences
} from '../../shared/attachments/clipAttachmentReferences';
import { AI_CHAT_IMAGE_TOKEN, type PreparedAIChatDocument } from './aiChatImagePreparation';

export function createAIChatImageResolver(
  prepared: PreparedAIChatDocument
): (node: HTMLElement) => string {
  return (node) => {
    const token = node.getAttribute(AI_CHAT_IMAGE_TOKEN);
    const occurrence = token ? prepared.occurrences.get(token) : undefined;
    if (!token || !occurrence) throw new Error('AI_CHAT_IMAGE_NOT_PREPARED');
    const alt = occurrence.alt.replace(/[\r\n]+/gu, ' ').replace(/[\\[\]]/gu, '\\$&');
    return `![${alt}](aiob-attachment:${token})`;
  };
}

export function finalizeAIChatImageMarkdown(
  markdown: string,
  prepared: PreparedAIChatDocument
): string {
  const counts = countClipAttachmentReferences(markdown, [...prepared.occurrences.keys()]);
  if (
    counts.has(undefined) ||
    [...prepared.occurrences.keys()].some((token) => counts.get(token) !== 1)
  )
    throw new Error('AI_CHAT_IMAGE_OCCURRENCE_MISSING');
  return replaceClipAttachmentReferences(
    markdown,
    [...prepared.occurrences].map(([id, occurrence]) => ({
      id,
      markdownUrl: `aiob-attachment:${occurrence.attachmentId}`
    }))
  );
}
