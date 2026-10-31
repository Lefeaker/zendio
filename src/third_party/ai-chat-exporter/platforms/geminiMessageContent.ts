import type { ParseConfig } from '../types';
import { chatElementToMarkdown } from '../shared/markdown';
import {
  cloneMessageWithImages,
  collectMessageImages,
  messageImageElements,
  queryMessageElements
} from '../shared/messageImages';

export const GEMINI_MESSAGE_ITEM_SELECTOR = 'user-query, model-response';

function findCanvas(root: ParentNode): HTMLElement | null {
  return (
    root
      .querySelector('immersive-container, immersive-panel, canvas-immersive-panel')
      ?.querySelector<HTMLElement>('canvas-content, immersive-canvas, immersive-page') ?? null
  );
}

export function pickGeminiMessageContent(item: HTMLElement): HTMLElement {
  if (item.tagName.toLowerCase() === 'user-query') {
    return (
      item.querySelector<HTMLElement>('[role="presentation"], [class*="query"]') ||
      item.querySelector<HTMLElement>('rich-text, div, p') ||
      item
    );
  }
  return (
    item.querySelector<HTMLElement>(
      'cib-shared-markdown, message-content, response-content, rich-text, model-output, article'
    ) || item
  );
}

export function findGeminiCanvasOwner(messages: readonly HTMLElement[]): HTMLElement | undefined {
  return messages.find((message) =>
    pickGeminiMessageContent(message).querySelector('immersive-entry-chip')
  );
}

export function collectGeminiImages(root: ParentNode, config?: ParseConfig) {
  // Pure reports are reconstructed from report text, not the conversation DOM.
  if (config?.deepResearch?.pureMode) return [];
  const messages = queryMessageElements(root, GEMINI_MESSAGE_ITEM_SELECTOR);
  const images = collectMessageImages('gemini', messages);
  if (findGeminiCanvasOwner(messages)) {
    const canvas = findCanvas(root);
    if (canvas) {
      const seen = new Set(images.map((image) => image.node));
      for (const image of collectMessageImages('gemini', [canvas])) {
        if (!seen.has(image.node)) images.push({ ...image, slotKey: `canvas:${image.slotKey}` });
      }
    }
  }
  return images;
}

export function extractCanvasContent(doc: ParentNode, config?: ParseConfig): string | null {
  const canvasContent = findCanvas(doc);
  if (!canvasContent) {
    return null;
  }

  let markdown = '\n\n---\n**Gemini Canvas Snapshot**\n\n';

  const titleElement = canvasContent.querySelector('h1, h2, .title, [data-test-id="title"]');
  if (titleElement?.textContent) {
    const title = titleElement.textContent.trim();
    if (title) {
      markdown += `### ${title}\n\n`;
    }
  }

  const textContent = canvasContent.querySelector<HTMLElement>(
    '[data-test-id="canvas-body"], [class*="content"], section'
  );
  if (textContent) {
    const canvasFragment = cloneMessageWithImages(textContent, [textContent]);
    const canvasMarkdown = chatElementToMarkdown(canvasFragment, config?.imageResolver);
    if (canvasMarkdown.trim()) {
      markdown += canvasMarkdown + '\n\n';
    }
  }

  const images = messageImageElements(canvasContent).filter(
    (image) => !textContent?.contains(image)
  );
  if (images.length > 0) {
    markdown += '#### Attached Images\n\n';
    images.forEach((img, index) => {
      if (config?.imageResolver) {
        markdown += config.imageResolver(img) + '\n\n';
        return;
      }
      const src =
        img.getAttribute('src') ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-original-src') ||
        '';
      if (src && !src.startsWith('blob:')) {
        const alt = img.getAttribute('alt') || `Canvas Image ${index + 1}`;
        markdown += `![${alt}](${src})\n\n`;
      }
    });
  }

  markdown += '---\n';
  return markdown;
}
