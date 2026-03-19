import { cleanupUIElements } from './dom';

const LANGUAGE_ALIAS_MAP: Record<string, string> = {
  'c++': 'cpp',
  'c#': 'csharp',
  'f#': 'fsharp',
  'plain text': 'text',
  'plaintext': 'text',
  'shell': 'bash',
  'sh': 'bash',
  'ps': 'powershell',
  'ps1': 'powershell',
  'objc': 'objective-c',
  'objective c': 'objective-c',
  'objective-c': 'objective-c',
  'js': 'javascript',
  'ts': 'typescript'
};

const CODE_LABEL_SKIP_SELECTOR = 'button, .button, [role="button"], [class*="copy" i], [class*="action" i], [class*="toolbar" i]';

const KNOWN_LANGUAGE_LABELS: Set<string> = new Set([
  'bash',
  'c',
  'c++',
  'cpp',
  'c#',
  'csharp',
  'clojure',
  'cmake',
  'cmd',
  'css',
  'dart',
  'dockerfile',
  'elixir',
  'erlang',
  'fish',
  'f#',
  'fsharp',
  'fortran',
  'go',
  'golang',
  'graphql',
  'groovy',
  'haskell',
  'html',
  'ini',
  'java',
  'javascript',
  'json',
  'julia',
  'kotlin',
  'latex',
  'less',
  'lua',
  'makefile',
  'markdown',
  'matlab',
  'md',
  'nim',
  'objective c',
  'objective-c',
  'objc',
  'ocaml',
  'perl',
  'php',
  'plain text',
  'plaintext',
  'powershell',
  'proto',
  'protobuf',
  'python',
  'r',
  'jsx',
  'reasonml',
  'ruby',
  'rust',
  'sas',
  'scala',
  'scheme',
  'scss',
  'shell',
  'sh',
  'sql',
  'stata',
  'swift',
  'tex',
  'text',
  'toml',
  'ts',
  'tsx',
  'typescript',
  'vb',
  'vb.net',
  'visual basic',
  'wasm',
  'webassembly',
  'xml',
  'yaml',
  'yml',
  'zig'
]);

let headingLevelOffset = 0;
let pendingCodeLanguageLabel: string | null = null;

function resolveLanguageLabel(label: string): string | null {
  if (!label) return null;

  const trimmed = label.trim().replace(/[：:]+$/, '');
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  if (LANGUAGE_ALIAS_MAP[lower]) {
    return LANGUAGE_ALIAS_MAP[lower];
  }

  if (KNOWN_LANGUAGE_LABELS.has(lower)) {
    return trimmed === trimmed.toUpperCase() ? lower : trimmed;
  }

  const collapsedLower = lower.replace(/\s+/g, '');
  if (LANGUAGE_ALIAS_MAP[collapsedLower]) {
    return LANGUAGE_ALIAS_MAP[collapsedLower];
  }

  if (KNOWN_LANGUAGE_LABELS.has(collapsedLower)) {
    const collapsedOriginal = trimmed.replace(/\s+/g, '');
    if (collapsedOriginal === collapsedOriginal.toUpperCase()) {
      return collapsedLower;
    }
    return collapsedOriginal;
  }

  return null;
}

function findAssociatedPreElement(elem: HTMLElement): HTMLElement | null {
  let current = elem.nextElementSibling as HTMLElement | null;
  while (current) {
    if (current.matches(CODE_LABEL_SKIP_SELECTOR)) {
      current = current.nextElementSibling as HTMLElement | null;
      continue;
    }

    if (current.tagName.toLowerCase() === 'pre') {
      return current;
    }

    const nestedPre = current.querySelector?.('pre');
    if (nestedPre) {
      return nestedPre as HTMLElement;
    }

    break;
  }

  const parent = elem.parentElement;
  if (parent) {
    const candidate = parent.querySelector('pre');
    if (candidate) {
      const relation = elem.compareDocumentPosition(candidate);
      if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
        return candidate as HTMLElement;
      }
    }
  }

  return null;
}

function isLikelyLanguageLabel(elem: HTMLElement, text: string): boolean {
  const preElement = findAssociatedPreElement(elem);
  if (!preElement) {
    return false;
  }

  const hasCodeChild = !!preElement.querySelector('code');
  if (!hasCodeChild) {
    return false;
  }

  const classAttr = elem.getAttribute('class') || '';
  const attrLanguage = elem.getAttribute('data-language') ||
    elem.getAttribute('data-code-language') ||
    elem.getAttribute('data-lang');

  if (attrLanguage) {
    return true;
  }

  if (resolveLanguageLabel(text)) {
    return true;
  }

  if (/\b(language|lang|syntax|code|chip|badge|toolbar|label)\b/i.test(classAttr)) {
    return true;
  }

  if (text && text === text.toUpperCase() && text.length <= 15) {
    return true;
  }

  return false;
}

function normalizeLanguageTag(label: string): string {
  const resolved = resolveLanguageLabel(label);
  if (resolved) {
    return resolved;
  }

  const trimmed = label.trim();
  if (!trimmed) {
    return '';
  }

  return trimmed === trimmed.toUpperCase() ? trimmed.toLowerCase() : trimmed;
}

function captureLanguageLabel(elem: HTMLElement): boolean {
  if (elem.querySelector('pre')) {
    return false;
  }

  const textContent = elem.textContent?.trim() || '';
  if (!textContent) {
    return false;
  }

  if (!isLikelyLanguageLabel(elem, textContent)) {
    return false;
  }

  const attrLanguage = elem.getAttribute('data-language') ||
    elem.getAttribute('data-code-language') ||
    elem.getAttribute('data-lang');

  const labelSource = attrLanguage || textContent;
  let normalized = normalizeLanguageTag(labelSource);
  if (!normalized) {
    normalized = labelSource.trim();
  }

  pendingCodeLanguageLabel = normalized || null;
  return true;
}

function captureLanguageLabelFromTextNode(node: Node, rawText: string): boolean {
  const resolvedLabel = resolveLanguageLabel(rawText);
  if (!resolvedLabel) {
    return false;
  }

  let sibling: Node | null = node.nextSibling;
  while (sibling) {
    if (sibling.nodeType === Node.TEXT_NODE) {
      const siblingText = sibling.textContent || '';
      if (siblingText.trim() === '') {
        sibling = sibling.nextSibling;
        continue;
      }
      return false;
    }

    if (sibling.nodeType === Node.ELEMENT_NODE) {
      const elem = sibling as HTMLElement;
      if (elem.matches(CODE_LABEL_SKIP_SELECTOR)) {
        sibling = elem.nextSibling;
        continue;
      }

      if (elem.tagName.toLowerCase() === 'pre') {
        pendingCodeLanguageLabel = normalizeLanguageTag(resolvedLabel);
        return true;
      }

      const nestedPre = elem.querySelector('pre');
      if (nestedPre) {
        pendingCodeLanguageLabel = normalizeLanguageTag(resolvedLabel);
        return true;
      }

      break;
    }

    break;
  }

  const parent = node.parentElement;
  if (parent) {
    const associatedPre = findAssociatedPreElement(parent);
    if (associatedPre) {
      pendingCodeLanguageLabel = normalizeLanguageTag(resolvedLabel);
      return true;
    }
  }

  return false;
}

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
                  .filter(n => n.nodeType === Node.TEXT_NODE ||
                    (n.nodeType === Node.ELEMENT_NODE &&
                      !(n as HTMLElement).classList.contains('msupsub')))
                  .map(n => n.textContent)
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
                  .map(char => superscriptMap[char] || char)
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
      return processTable(elem);
    }

    if (tagName === 'ul' || tagName === 'ol') {
      const items = Array.from(elem.children).filter(child => child.tagName.toLowerCase() === 'li') as HTMLElement[];
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
        .map((li, index) => processListItem(li, indent, isOrdered ? startNumber + index : undefined))
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
        let language = codeElem.getAttribute('class')
          ?.split(' ')
          .find(cls => cls.startsWith('language-'))
          ?.replace('language-', '')
          ?.trim() ?? '';
        const attrLanguage = codeElem.getAttribute('data-language') ||
          elem.getAttribute('data-language') ||
          elem.getAttribute('data-code-language') ||
          elem.getAttribute('data-lang') ||
          '';
        if (attrLanguage) {
          language = attrLanguage;
        }

        if (!language && pendingCodeLanguageLabel) {
          language = pendingCodeLanguageLabel;
        }

        pendingCodeLanguageLabel = null;

        const normalizedLanguage = language ? normalizeLanguageTag(language) : '';
        const codeContent = codeElem.textContent || '';
        const languageFence = normalizedLanguage ? normalizedLanguage : '';
        return `\n\n\`\`\`${languageFence}\n${codeContent}\n\`\`\`\n\n`;
      }
      pendingCodeLanguageLabel = null;
      return `\n\n\`\`\`\n${elem.textContent || ''}\n\`\`\`\n\n`;
    }

    if (tagName === 'code') {
      return '`' + (elem.textContent || '') + '`';
    }

    if (tagName === 'strong' || tagName === 'b') {
      const content = processChildren(elem, indent);
      const prevSibling = elem.previousSibling;
      const nextSibling = elem.nextSibling;
      const needSpaceBefore = !!(prevSibling && prevSibling.nodeType === Node.TEXT_NODE &&
        prevSibling.textContent && /\S$/.test(prevSibling.textContent));
      const needSpaceAfter = !!(nextSibling && nextSibling.nodeType === Node.TEXT_NODE &&
        nextSibling.textContent && /^\S/.test(nextSibling.textContent));

      return (needSpaceBefore ? ' ' : '') + '**' + content + '**' + (needSpaceAfter ? ' ' : '');
    }

    if (tagName === 'em' || tagName === 'i') {
      const content = processChildren(elem, indent);
      const prevSibling = elem.previousSibling;
      const nextSibling = elem.nextSibling;
      const needSpaceBefore = !!(prevSibling && prevSibling.nodeType === Node.TEXT_NODE &&
        prevSibling.textContent && /\S$/.test(prevSibling.textContent));
      const needSpaceAfter = !!(nextSibling && nextSibling.nodeType === Node.TEXT_NODE &&
        nextSibling.textContent && /^\S/.test(nextSibling.textContent));

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
        src = elem.getAttribute('data-src') ||
          elem.getAttribute('data-original-src') ||
          elem.getAttribute('data-image-url') ||
          elem.getAttribute('data-url') || '';

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

    if (tagName === 'image-query' || tagName === 'uploaded-image' ||
      elem.classList.contains('uploaded-image') ||
      elem.classList.contains('image-container')) {
      const imgElement = elem.querySelector('img');
      if (imgElement) {
        const src = imgElement.getAttribute('src') ||
          imgElement.getAttribute('data-src') ||
          imgElement.getAttribute('data-original-src') || '';
        const alt = imgElement.getAttribute('alt') || 'Image';

        if (src && !src.startsWith('blob:')) {
          return `![${alt}](${src})`;
        }
      }

      const imageUrl = elem.getAttribute('data-image-url') ||
        elem.getAttribute('data-src') ||
        elem.getAttribute('data-url') ||
        elem.getAttribute('src') || '';

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
        .map(line => (line ? `> ${line}` : '>'))
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

function processTable(table: HTMLElement): string {
  const rows: string[][] = [];
  let hasHeader = false;
  const kimiLabel = table.getAttribute('data-kimi-label')?.trim();

  const thead = table.querySelector('thead');
  if (thead) {
    const headerRows = thead.querySelectorAll('tr');
    headerRows.forEach(tr => {
      const cells: string[] = [];
      tr.querySelectorAll('th, td').forEach(cell => {
        const cellContent = getCellContent(cell as HTMLElement);
        cells.push(cellContent);
      });
      if (cells.length > 0) {
        rows.push(cells);
        hasHeader = true;
      }
    });
  }

  const tbody = table.querySelector('tbody');
  if (tbody) {
    const bodyRows = tbody.querySelectorAll('tr');
    bodyRows.forEach(tr => {
      const cells: string[] = [];
      tr.querySelectorAll('td, th').forEach(cell => {
        const cellContent = getCellContent(cell as HTMLElement);
        cells.push(cellContent);
      });
      if (cells.length > 0) {
        rows.push(cells);
      }
    });
  }

  if (!hasHeader && rows.length > 0) {
    hasHeader = true;
  }

  if (rows.length === 0) {
    return '';
  }

  if (kimiLabel && rows.length > 0 && rows[0].length > 0) {
    const headerRow = rows[0];
    rows[0] = [kimiLabel, ...headerRow];
    for (let i = 1; i < rows.length; i++) {
      rows[i] = [...rows[i], ''];
    }
  }

  let result = '\n\n';

  if (hasHeader) {
    const headerRow = rows[0];
    result += '| ' + headerRow.join(' | ') + ' |\n';
    result += '| ' + headerRow.map(() => '---').join(' | ') + ' |\n';
    for (let i = 1; i < rows.length; i++) {
      result += '| ' + rows[i].join(' | ') + ' |\n';
    }
  } else {
    rows.forEach(row => {
      result += '| ' + row.join(' | ') + ' |\n';
    });
  }

  result += '\n';
  return result;
}

function getCellContent(cell: HTMLElement): string {
  let content = '';

  for (const child of Array.from(cell.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      content += child.textContent || '';
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const elem = child as HTMLElement;
      const tagName = elem.tagName.toLowerCase();

      if (elem.classList.contains('katex') || elem.classList.contains('math-inline')) {
        content += nodeToMarkdown(elem, '');
      } else if (tagName === 'strong' || tagName === 'b') {
        const hasKatex = elem.querySelector('.katex, .math-inline');
        if (hasKatex) {
          content += '**';
          for (const grandChild of Array.from(elem.childNodes)) {
            if (grandChild.nodeType === Node.TEXT_NODE) {
              content += grandChild.textContent || '';
            } else if (grandChild.nodeType === Node.ELEMENT_NODE) {
              const grandElem = grandChild as HTMLElement;
              if (grandElem.classList.contains('katex') || grandElem.classList.contains('math-inline')) {
                content += nodeToMarkdown(grandElem, '');
              } else {
                content += grandElem.textContent || '';
              }
            }
          }
          content += '**';
        } else {
          content += '**' + (elem.textContent || '') + '**';
        }
      } else if (tagName === 'em' || tagName === 'i') {
        content += '*' + (elem.textContent || '') + '*';
      } else if (tagName === 'code') {
        content += '`' + (elem.textContent || '') + '`';
      } else if (tagName === 'a') {
        const href = elem.getAttribute('href') || '';
        const text = elem.textContent || '';
        content += `[${text}](${href})`;
      } else if (tagName === 'br') {
        content += ' ';
      } else if (tagName === 'sup') {
        content += '^' + (elem.textContent || '') + '^';
      } else if (tagName === 'sub') {
        content += '~' + (elem.textContent || '') + '~';
      } else {
        content += nodeToMarkdown(elem, '');
      }
    }
  }

  content = content.trim();
  content = content.replace(/\s+/g, ' ');

  return content;
}

function processListItem(li: HTMLElement, indent: string, itemNumber?: number): string {
  let result = '';
  const marker = itemNumber !== undefined ? `${itemNumber}. ` : '- ';
  const blockElements: HTMLElement[] = [];
  const inlineFragments: string[] = [];

  for (const child of Array.from(li.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent?.trim();
      if (text) {
        inlineFragments.push(text);
      }
      continue;
    }

    if (child.nodeType === Node.ELEMENT_NODE) {
      const elem = child as HTMLElement;
      const tag = elem.tagName.toLowerCase();

      if (['ul', 'ol', 'table', 'pre', 'blockquote'].includes(tag)) {
        blockElements.push(elem);
        continue;
      }

      if (tag === 'p' || tag === 'div' || tag === 'span') {
        if (inlineFragments.length === 0 && blockElements.length === 0) {
          const collapsed = nodeToMarkdown(elem, indent + '  ')
            .replace(/\s+/g, ' ')
            .trim();
          const looksLikeNested = /^([-*+]|\d+\.)\s/.test(collapsed);

          if (collapsed && !looksLikeNested) {
            inlineFragments.push(collapsed);
            continue;
          }
        }

        blockElements.push(elem);
        continue;
      }

      inlineFragments.push(nodeToMarkdown(elem, indent + '  '));
    }
  }

  const inlineContent = inlineFragments.join(' ').trim();
  const remainingBlocks = blockElements;

  result += `${indent}${marker}${inlineContent}`;

  const blockContents = remainingBlocks
    .map(block => nodeToMarkdown(block, indent + '  ').replace(/\s+$/g, ''))
    .filter(content => content.trim().length > 0);

  if (blockContents.length) {
    const prefix = inlineContent ? '\n\n' : '\n';
    result += prefix + blockContents.join('\n\n');
    return result + '\n\n';
  }

  return result + '\n';
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

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  cleanupUIElements(tempDiv);

  const headings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
  let minHeadingLevel = 7;
  headings.forEach(h => {
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

  markdown = markdown
    .replace(/\n\s*\n\s*\n/g, '\n\n')
    .replace(/^\s+|\s+$/g, '');

  markdown = fixDanglingLanguageLabels(markdown);

  return markdown;
}

export { nodeToMarkdown };
