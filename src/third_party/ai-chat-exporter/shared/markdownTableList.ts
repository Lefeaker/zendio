interface MarkdownRenderer {
  (node: Node, indent?: string): string;
}

export function processTable(table: HTMLElement, renderNode: MarkdownRenderer): string {
  const rows: string[][] = [];
  let hasHeader = false;
  const kimiLabel = table.getAttribute('data-kimi-label')?.trim();

  const thead = table.querySelector('thead');
  if (thead) {
    const headerRows = thead.querySelectorAll('tr');
    headerRows.forEach((tr) => {
      const cells: string[] = [];
      tr.querySelectorAll('th, td').forEach((cell) => {
        cells.push(getCellContent(cell as HTMLElement, renderNode));
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
    bodyRows.forEach((tr) => {
      const cells: string[] = [];
      tr.querySelectorAll('td, th').forEach((cell) => {
        cells.push(getCellContent(cell as HTMLElement, renderNode));
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
    rows[0] = [kimiLabel, ...rows[0]];
    for (let i = 1; i < rows.length; i += 1) {
      rows[i] = [...rows[i], ''];
    }
  }

  let result = '\n\n';
  if (hasHeader) {
    result += `| ${rows[0].join(' | ')} |\n`;
    result += `| ${rows[0].map(() => '---').join(' | ')} |\n`;
    for (let i = 1; i < rows.length; i += 1) {
      result += `| ${rows[i].join(' | ')} |\n`;
    }
  } else {
    rows.forEach((row) => {
      result += `| ${row.join(' | ')} |\n`;
    });
  }

  return result + '\n';
}

function getCellContent(cell: HTMLElement, renderNode: MarkdownRenderer): string {
  let content = '';

  for (const child of Array.from(cell.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      content += child.textContent || '';
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const elem = child as HTMLElement;
      const tagName = elem.tagName.toLowerCase();

      if (elem.classList.contains('katex') || elem.classList.contains('math-inline')) {
        content += renderNode(elem, '');
      } else if (tagName === 'strong' || tagName === 'b') {
        const hasKatex = elem.querySelector('.katex, .math-inline');
        if (hasKatex) {
          content += '**';
          for (const grandChild of Array.from(elem.childNodes)) {
            if (grandChild.nodeType === Node.TEXT_NODE) {
              content += grandChild.textContent || '';
            } else if (grandChild.nodeType === Node.ELEMENT_NODE) {
              const grandElem = grandChild as HTMLElement;
              if (
                grandElem.classList.contains('katex') ||
                grandElem.classList.contains('math-inline')
              ) {
                content += renderNode(grandElem, '');
              } else {
                content += grandElem.textContent || '';
              }
            }
          }
          content += '**';
        } else {
          content += `**${elem.textContent || ''}**`;
        }
      } else if (tagName === 'em' || tagName === 'i') {
        content += `*${elem.textContent || ''}*`;
      } else if (tagName === 'code') {
        content += `\`${elem.textContent || ''}\``;
      } else if (tagName === 'a') {
        const href = elem.getAttribute('href') || '';
        content += `[${elem.textContent || ''}](${href})`;
      } else if (tagName === 'br') {
        content += ' ';
      } else if (tagName === 'sup') {
        content += `^${elem.textContent || ''}^`;
      } else if (tagName === 'sub') {
        content += `~${elem.textContent || ''}~`;
      } else {
        content += renderNode(elem, '');
      }
    }
  }

  return content.trim().replace(/\s+/g, ' ');
}

export function processListItem(
  li: HTMLElement,
  indent: string,
  renderNode: MarkdownRenderer,
  itemNumber?: number
): string {
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
          const collapsed = renderNode(elem, indent + '  ')
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

      inlineFragments.push(renderNode(elem, indent + '  '));
    }
  }

  const inlineContent = inlineFragments.join(' ').trim();
  result += `${indent}${marker}${inlineContent}`;

  const blockContents = blockElements
    .map((block) => renderNode(block, indent + '  ').replace(/\s+$/g, ''))
    .filter((content) => content.trim().length > 0);

  if (blockContents.length) {
    result += `${inlineContent ? '\n\n' : '\n'}${blockContents.join('\n\n')}`;
    return result + '\n\n';
  }

  return result + '\n';
}
