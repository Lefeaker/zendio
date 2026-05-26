import { cleanupUIElements } from './dom';
import {
  captureLanguageLabel,
  captureLanguageLabelFromTextNode,
  normalizeLanguageTag,
  resetPendingCodeLanguageLabel,
  resolveLanguageLabel
} from './markdownLanguage';
import { renderBlockMarkdownNode } from './markdownBlockNodes';
import { renderInlineMarkdownNode } from './markdownInlineNodes';
import { processChildNodes } from './markdownNodeTraversal';

let headingLevelOffset = 0;

function nodeToMarkdown(node: Node, indent = ''): string {
  if (node.nodeType === Node.TEXT_NODE) {
    const textContent = node.textContent || '';
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

    const inlineMarkdown = renderInlineMarkdownNode(elem, tagName, indent, processChildren);
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

function fixDanglingLanguageLabels(markdown: string): string {
  if (!markdown.includes('```')) {
    return markdown;
  }

  const lines = markdown.split('\n');
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed) {
      const resolved = resolveLanguageLabel(trimmed);
      if (resolved) {
        let j = i + 1;
        while (j < lines.length && lines[j].trim() === '') {
          j++;
        }

        if (j < lines.length) {
          const fenceLine = lines[j];
          const fenceTrimmed = fenceLine.trim();
          if (fenceTrimmed === '```') {
            const indentMatch = fenceLine.match(/^\s*/);
            const indent = indentMatch ? indentMatch[0] : '';
            result.push(`${indent}\`\`\`${normalizeLanguageTag(resolved)}`);
            i = j;
            continue;
          }
        }
      }
    }

    result.push(line);
  }

  return result.join('\n');
}

export function chatHtmlToMarkdown(html: string): string {
  if (!html) return '';
  resetPendingCodeLanguageLabel();

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  cleanupUIElements(tempDiv);

  const headings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
  let minHeadingLevel = 7;
  headings.forEach((h) => {
    const level = parseInt(h.tagName[1]);
    if (level < minHeadingLevel) {
      minHeadingLevel = level;
    }
  });

  if (minHeadingLevel <= 6) {
    headingLevelOffset = 2 - minHeadingLevel;
  } else {
    headingLevelOffset = 0;
  }

  let markdown = processChildren(tempDiv);

  markdown = markdown
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  markdown = markdown.replace(/\n\s*\n\s*\n/g, '\n\n').replace(/^\s+|\s+$/g, '');

  markdown = fixDanglingLanguageLabels(markdown);

  return markdown;
}

export { nodeToMarkdown };
