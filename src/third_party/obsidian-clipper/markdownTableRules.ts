import TurndownService from 'turndown';

export function registerMarkdownTableRules(turndownService: TurndownService): void {
  turndownService.addRule('table', {
    filter: 'table',
    replacement: function (content: string, node: Node) {
      if (!(node instanceof HTMLTableElement)) return content;

      const hasComplexStructure = Array.from(node.querySelectorAll('td, th')).some(
        (cell) => cell.hasAttribute('colspan') || cell.hasAttribute('rowspan')
      );

      if (hasComplexStructure) {
        return '\n\n' + cleanupTableHTML(node) + '\n\n';
      }

      const rows = Array.from(node.rows).map((row) => {
        const cells = Array.from(row.cells).map((cell) => {
          let cellContent = turndownService.turndown(cell.innerHTML).replace(/\n/g, ' ').trim();
          cellContent = cellContent.replace(/\|/g, '\\|');
          return cellContent;
        });
        return `| ${cells.join(' | ')} |`;
      });

      const separatorRow = `| ${Array(rows[0].split('|').length - 2)
        .fill('---')
        .join(' | ')} |`;
      const tableContent = [rows[0], separatorRow, ...rows.slice(1)].join('\n');

      return `\n\n${tableContent}\n\n`;
    }
  });
}

function cleanupTableHTML(table: HTMLTableElement): string {
  const allowedAttributes = [
    'src',
    'href',
    'style',
    'align',
    'width',
    'height',
    'rowspan',
    'colspan',
    'bgcolor',
    'scope',
    'valign',
    'headers'
  ];

  const cleanElement = (element: Element) => {
    Array.from(element.attributes).forEach((attr) => {
      if (!allowedAttributes.includes(attr.name)) {
        element.removeAttribute(attr.name);
      }
    });

    element.childNodes.forEach((child) => {
      if (child instanceof Element) {
        cleanElement(child);
      }
    });
  };

  const tableClone = table.cloneNode(true) as HTMLTableElement;
  cleanElement(tableClone);

  return tableClone.outerHTML;
}
