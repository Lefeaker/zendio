import {
  captureLanguageLabel,
  consumePendingCodeLanguageLabel,
  normalizeLanguageTag,
  resetPendingCodeLanguageLabel
} from './markdownLanguage';
import { processListItem, processTable } from './markdownTableList';
import type { MarkdownChildrenProcessor, MarkdownRenderer } from './markdownNodeTraversal';

interface RenderBlockMarkdownNodeOptions {
  headingLevelOffset: number;
  processChildren: MarkdownChildrenProcessor;
  renderNode: MarkdownRenderer;
}

export function renderBlockMarkdownNode(
  elem: HTMLElement,
  tagName: string,
  indent: string,
  options: RenderBlockMarkdownNodeOptions
): string | null {
  if (tagName === 'table') {
    return processTable(elem, options.renderNode);
  }

  if (tagName === 'ul' || tagName === 'ol') {
    return renderListNode(elem, tagName, indent, options.renderNode);
  }

  if (tagName === 'pre') {
    return renderPreNode(elem, indent, options.processChildren);
  }

  if (tagName.match(/^h[1-6]$/)) {
    const level = parseInt(tagName[1]);
    const adjustedLevel = Math.max(2, Math.min(level + options.headingLevelOffset, 6));
    return '\n' + '#'.repeat(adjustedLevel) + ' ' + options.processChildren(elem, indent) + '\n\n';
  }

  if (tagName === 'p') {
    const content = options.processChildren(elem, indent);
    return content + '\n\n';
  }

  if (tagName === 'br') {
    return '\n';
  }

  if (tagName === 'blockquote') {
    const quoteLines = options
      .processChildren(elem, indent)
      .split('\n')
      .map((line) => (line ? `> ${line}` : '>'))
      .join('\n');
    return `\n${quoteLines}\n\n`;
  }

  if (tagName === 'hr') {
    return '\n---\n\n';
  }

  if (tagName === 'div' || tagName === 'span') {
    if (captureLanguageLabel(elem)) {
      return '';
    }
    return options.processChildren(elem, indent);
  }

  return null;
}

function renderListNode(
  elem: HTMLElement,
  tagName: string,
  indent: string,
  renderNode: MarkdownRenderer
): string {
  const items = Array.from(elem.children).filter(
    (child) => child.tagName.toLowerCase() === 'li'
  ) as HTMLElement[];
  const isOrdered = tagName === 'ol';
  const startAttr = elem.getAttribute('start');
  let startNumber = 1;
  if (isOrdered && startAttr) {
    const parsed = parseInt(startAttr, 10);
    if (!Number.isNaN(parsed)) {
      startNumber = parsed;
    }
  }

  return items
    .map((li, index) =>
      processListItem(li, indent, renderNode, isOrdered ? startNumber + index : undefined)
    )
    .join('');
}

function renderPreNode(
  elem: HTMLElement,
  indent: string,
  processChildren: MarkdownChildrenProcessor
): string {
  const tableInside = elem.querySelector('table');
  if (tableInside) {
    // Claude 有时会把表格包在 <pre> 中，这里直接解析内部结构
    return `\n${processChildren(elem, indent)}\n`;
  }

  const codeElem = elem.querySelector('code');
  if (codeElem) {
    let language =
      codeElem
        .getAttribute('class')
        ?.split(' ')
        .find((cls) => cls.startsWith('language-'))
        ?.replace('language-', '')
        ?.trim() ?? '';
    const attrLanguage =
      codeElem.getAttribute('data-language') ||
      elem.getAttribute('data-language') ||
      elem.getAttribute('data-code-language') ||
      elem.getAttribute('data-lang') ||
      '';
    if (attrLanguage) {
      language = attrLanguage;
    }

    if (!language) {
      language = consumePendingCodeLanguageLabel() || '';
    } else {
      resetPendingCodeLanguageLabel();
    }

    const normalizedLanguage = language ? normalizeLanguageTag(language) : '';
    const codeContent = codeElem.textContent || '';
    const languageFence = normalizedLanguage ? normalizedLanguage : '';
    return `\n\n\`\`\`${languageFence}\n${codeContent}\n\`\`\`\n\n`;
  }
  resetPendingCodeLanguageLabel();
  return `\n\n\`\`\`\n${elem.textContent || ''}\n\`\`\`\n\n`;
}
