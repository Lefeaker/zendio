import { cleanupUIElements } from './dom';
import {
  captureLanguageLabel,
  captureLanguageLabelFromTextNode,
  resetPendingCodeLanguageLabel
} from './markdownLanguage';
import { renderBlockMarkdownNode } from './markdownBlockNodes';
import { renderInlineMarkdownNode } from './markdownInlineNodes';
import { processChildNodes } from './markdownNodeTraversal';
import type { ParseConfig } from '../types';
import { messageImageElements } from './messageImages';

type MarkdownRoot = HTMLElement | DocumentFragment;

function isParentNode(node: Node | null): node is Node & ParentNode {
  return node !== null && 'querySelectorAll' in node;
}

function bordersImage(node: Node | null): boolean {
  return isParentNode(node) && messageImageElements(node).length > 0;
}

function imageAdjacentText(node: Node): string {
  const text = node.textContent || '';
  if (!/[\t ]/.test(text) || node.parentElement?.closest('pre, code')) return text;
  const nextImage = bordersImage(node.nextSibling);
  if (!nextImage && !bordersImage(node.previousSibling)) return text;
  // HTML indentation beside a real image is layout, not an indented Markdown
  // code block. Only these adjacent whitespace runs change; code text does not.
  if (!text.trim()) return /[\r\n]/.test(text) ? text.replace(/[\t ]/g, '') : ' ';
  return nextImage ? text.replace(/(^|\r?\n)[\t ]+$/u, '$1') : text;
}

function createNodeRenderer(
  headingLevelOffset: number,
  imageResolver?: ParseConfig['imageResolver']
) {
  function nodeToMarkdown(node: Node, indent = ''): string {
    if (node.nodeType === Node.TEXT_NODE) {
      const textContent = imageAdjacentText(node);
      if (captureLanguageLabelFromTextNode(node, textContent)) {
        return '';
      }

      return textContent;
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const elem = node as HTMLElement;
      if (captureLanguageLabel(elem)) {
        return '';
      }

      const tagName = elem.tagName.toLowerCase();

      const inlineMarkdown = renderInlineMarkdownNode(
        elem,
        tagName,
        indent,
        processChildren,
        imageResolver
      );
      if (inlineMarkdown !== null) {
        return inlineMarkdown;
      }

      const blockMarkdown = renderBlockMarkdownNode(elem, tagName, indent, {
        headingLevelOffset,
        processChildren,
        renderNode: nodeToMarkdown
      });
      if (blockMarkdown !== null) {
        return blockMarkdown;
      }

      return processChildren(elem, indent);
    }

    return '';
  }

  function processChildren(elem: HTMLElement, indent = ''): string {
    return processChildNodes(elem, nodeToMarkdown, indent);
  }

  return nodeToMarkdown;
}

function getHeadingLevelOffset(root: ParentNode): number {
  const headings = root.querySelectorAll('h1, h2, h3, h4, h5, h6');
  let minHeadingLevel = 7;
  headings.forEach((h) => {
    const level = parseInt(h.tagName[1]);
    if (level < minHeadingLevel) {
      minHeadingLevel = level;
    }
  });

  return minHeadingLevel <= 6 ? 2 - minHeadingLevel : 0;
}

function normalizeRenderedMarkdown(markdown: string): string {
  let normalized = markdown
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  normalized = normalized.replace(/\n\s*\n\s*\n/g, '\n\n').replace(/^\s+|\s+$/g, '');

  return normalized;
}

function cloneMarkdownRoot(root: MarkdownRoot): HTMLElement {
  if (root.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    const container = document.createElement('div');
    container.append(root.cloneNode(true));
    return container;
  }

  return root.cloneNode(true) as HTMLElement;
}

// Live parser paths should use this node-based API when they already have DOM nodes.
export function chatElementToMarkdown(
  root: MarkdownRoot,
  imageResolver?: ParseConfig['imageResolver']
): string {
  resetPendingCodeLanguageLabel();

  const clonedRoot = cloneMarkdownRoot(root);
  cleanupUIElements(clonedRoot);
  const render = createNodeRenderer(getHeadingLevelOffset(clonedRoot), imageResolver);
  return normalizeRenderedMarkdown(
    Array.from(clonedRoot.childNodes)
      .map((node) => render(node))
      .join('')
  );
}

export function chatHtmlToMarkdown(
  html: string,
  imageResolver?: ParseConfig['imageResolver']
): string {
  if (!html) return '';

  const Parser = document.defaultView?.DOMParser ?? DOMParser;
  const parsed = new Parser().parseFromString(html, 'text/html');
  return chatElementToMarkdown(parsed.body, imageResolver);
}

export function nodeToMarkdown(node: Node, indent = ''): string {
  return createNodeRenderer(0)(node, indent);
}
