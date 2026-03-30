import { cleanupUIElements } from './dom';
import {
  captureLanguageLabel,
  captureLanguageLabelFromTextNode,
  consumePendingCodeLanguageLabel,
  normalizeLanguageTag,
  resetPendingCodeLanguageLabel,
  resolveLanguageLabel
} from './markdownLanguage';
import { processListItem, processTable } from './markdownTableList';

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

    if (tagName === 'source-footnote') {
      const sup = elem.querySelector('sup');
      if (sup) {
        let number = sup.textContent?.trim();
        if (!number) {
          const sourceIndex = sup.getAttribute('data-turn-source-index');
          if (sourceIndex) {
            number = sourceIndex;
          }
        }
        if (number) {
          return `[${number}]`;
        }
      }
      return '';
    }

    if (elem.classList.contains('katex') || elem.classList.contains('math-inline')) {
      const annotation = elem.querySelector('annotation[encoding="application/x-tex"]');
      if (annotation?.textContent) {
        return `$${annotation.textContent}$`;
      }

      const mathml = elem.querySelector('math');
      if (mathml?.textContent) {
        return mathml.textContent.trim();
      }

      const katexHtml = elem.querySelector('.katex-html');
      if (katexHtml) {
        let result = '';
        const bases = katexHtml.querySelectorAll('.base');

        bases.forEach((base) => {
          for (const child of Array.from(base.children)) {
            const childElem = child as HTMLElement;
            const className = childElem.className || '';
            if (className.includes('strut')) continue;

            if (className.includes('mord') || className.includes('mbin')) {
              const msupsub = childElem.querySelector('.msupsub');
              if (msupsub) {
                const baseText = Array.from(childElem.childNodes)
                  .filter(
                    (n) =>
                      n.nodeType === Node.TEXT_NODE ||
                      (n.nodeType === Node.ELEMENT_NODE &&
                        !(n as HTMLElement).classList.contains('msupsub'))
                  )
                  .map((n) => n.textContent)
                  .join('');

                const mtight = msupsub.querySelector('.mtight');
                const supText = mtight?.textContent || '';

                const superscriptMap: Record<string, string> = {
                  '0': '⁰',
                  '1': '¹',
                  '2': '²',
                  '3': '³',
                  '4': '⁴',
                  '5': '⁵',
                  '6': '⁶',
                  '7': '⁷',
                  '8': '⁸',
                  '9': '⁹',
                  '+': '⁺',
                  '-': '⁻',
                  '=': '⁼',
                  '(': '⁽',
                  ')': '⁾'
                };

                const superscript = supText
                  .split('')
                  .map((char) => superscriptMap[char] || char)
                  .join('');

                result += `${baseText}${superscript}`;
              } else {
                result += childElem.textContent || '';
              }
            } else if (className.includes('mop')) {
              result += childElem.textContent || '';
            }
          }
        });

        return result.trim();
      }

      const textContent = elem.textContent?.trim();
      if (textContent) {
        return textContent;
      }

      return '';
    }

    if (tagName === 'table') {
      return processTable(elem, nodeToMarkdown);
    }

    if (tagName === 'ul' || tagName === 'ol') {
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
          processListItem(li, indent, nodeToMarkdown, isOrdered ? startNumber + index : undefined)
        )
        .join('');
    }

    if (tagName === 'pre') {
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

    if (tagName === 'code') {
      return '`' + (elem.textContent || '') + '`';
    }

    if (tagName === 'strong' || tagName === 'b') {
      const content = processChildren(elem, indent);
      const prevSibling = elem.previousSibling;
      const nextSibling = elem.nextSibling;
      const needSpaceBefore = !!(
        prevSibling &&
        prevSibling.nodeType === Node.TEXT_NODE &&
        prevSibling.textContent &&
        /\S$/.test(prevSibling.textContent)
      );
      const needSpaceAfter = !!(
        nextSibling &&
        nextSibling.nodeType === Node.TEXT_NODE &&
        nextSibling.textContent &&
        /^\S/.test(nextSibling.textContent)
      );

      return (needSpaceBefore ? ' ' : '') + '**' + content + '**' + (needSpaceAfter ? ' ' : '');
    }

    if (tagName === 'em' || tagName === 'i') {
      const content = processChildren(elem, indent);
      const prevSibling = elem.previousSibling;
      const nextSibling = elem.nextSibling;
      const needSpaceBefore = !!(
        prevSibling &&
        prevSibling.nodeType === Node.TEXT_NODE &&
        prevSibling.textContent &&
        /\S$/.test(prevSibling.textContent)
      );
      const needSpaceAfter = !!(
        nextSibling &&
        nextSibling.nodeType === Node.TEXT_NODE &&
        nextSibling.textContent &&
        /^\S/.test(nextSibling.textContent)
      );

      return (needSpaceBefore ? ' ' : '') + '*' + content + '*' + (needSpaceAfter ? ' ' : '');
    }

    if (tagName === 'a') {
      const href = elem.getAttribute('href') || '';
      const text = processChildren(elem, indent);
      return `[${text}](${href})`;
    }

    if (tagName === 'img') {
      let src = elem.getAttribute('src') || '';
      const alt = elem.getAttribute('alt') || '';

      if (src.startsWith('blob:')) {
        console.log('[Image] Warning: Found unconverted blob URL during markdown conversion');
        return '\n> ⚠️ **[User uploaded image - not available]**\n> Gemini uses temporary blob URLs for uploaded images. The image could not be converted.\n\n';
      }

      if (!src) {
        src =
          elem.getAttribute('data-src') ||
          elem.getAttribute('data-original-src') ||
          elem.getAttribute('data-image-url') ||
          elem.getAttribute('data-url') ||
          '';

        if (!src) {
          console.log('[Image] Skipping image with empty URL');
          return '';
        }
      }

      if (src.startsWith('data:image/')) {
        console.log('[Image] Including base64 image in markdown');
      }

      return `![${alt}](${src})`;
    }

    if (
      tagName === 'image-query' ||
      tagName === 'uploaded-image' ||
      elem.classList.contains('uploaded-image') ||
      elem.classList.contains('image-container')
    ) {
      const imgElement = elem.querySelector('img');
      if (imgElement) {
        const src =
          imgElement.getAttribute('src') ||
          imgElement.getAttribute('data-src') ||
          imgElement.getAttribute('data-original-src') ||
          '';
        const alt = imgElement.getAttribute('alt') || 'Image';

        if (src && !src.startsWith('blob:')) {
          return `![${alt}](${src})`;
        }
      }

      const imageUrl =
        elem.getAttribute('data-image-url') ||
        elem.getAttribute('data-src') ||
        elem.getAttribute('data-url') ||
        elem.getAttribute('src') ||
        '';

      if (imageUrl && !imageUrl.startsWith('blob:')) {
        return `![Image](${imageUrl})`;
      }

      console.log('[Image] Skipping custom image element with no valid URL');
      return '';
    }

    if (tagName.match(/^h[1-6]$/)) {
      const level = parseInt(tagName[1]);
      const adjustedLevel = Math.max(2, Math.min(level + headingLevelOffset, 6));
      return '\n' + '#'.repeat(adjustedLevel) + ' ' + processChildren(elem, indent) + '\n\n';
    }

    if (tagName === 'p') {
      const content = processChildren(elem, indent);
      return content + '\n\n';
    }

    if (tagName === 'br') {
      return '\n';
    }

    if (tagName === 'blockquote') {
      const quoteLines = processChildren(elem, indent)
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
      return processChildren(elem, indent);
    }

    return processChildren(elem, indent);
  }

  return '';
}

function processChildren(elem: HTMLElement, indent = ''): string {
  let result = '';
  for (const child of Array.from(elem.childNodes)) {
    result += nodeToMarkdown(child, indent);
  }
  return result;
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
