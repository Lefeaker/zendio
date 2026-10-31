import { cleanupUIElements } from '../../third_party/ai-chat-exporter/shared/dom';
import { chatGPTContentSignature } from '../../third_party/ai-chat-exporter/shared/chatgptCodeBlocks';
import { imageContentSignature } from '../../third_party/ai-chat-exporter/shared/messageImages';

/** Snapshot guards observe content, excluding controls that parsers discard. */
export function aiChatSnapshotSignature(
  root: Node & ParentNode,
  platform: string,
  images = imageContentSignature(root)
): string {
  const content = root.nodeType === 9 ? (root as Document).body : (root as HTMLElement);
  let text: string;
  if (platform === 'chatgpt') text = chatGPTContentSignature(content);
  else {
    const clone = content.cloneNode(true) as HTMLElement;
    if (platform === 'grok')
      clone
        .querySelectorAll('[data-no-copy="true"], .thinking-container')
        .forEach((node) => node.remove());
    cleanupUIElements(clone);
    text = clone.textContent ?? '';
  }
  return `${text}\u0000${images}`;
}
