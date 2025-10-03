// Obsidian Web Clipper - Markdown Rules
// Migrated from: https://github.com/obsidianmd/obsidian-clipper
// License: MIT

import TurndownService from 'turndown';

/**
 * Apply Obsidian-specific Turndown rules to a TurndownService instance
 */
export function applyObsidianRules(turndownService: TurndownService): void {
  
  // Highlight rule (mark -> ==text==)
  turndownService.addRule('highlight', {
    filter: 'mark',
    replacement: function(content) {
      return '==' + content + '==';
    }
  });

  // Strikethrough rule (del/s/strike -> ~~text~~)
  turndownService.addRule('strikethrough', {
    filter: (node: Node) => 
      node.nodeName === 'DEL' || 
      node.nodeName === 'S' || 
      node.nodeName === 'STRIKE',
    replacement: function(content) {
      return '~~' + content + '~~';
    }
  });

  // Task list items (checkbox -> - [ ] / - [x])
  turndownService.addRule('taskListItem', {
    filter: 'li',
    replacement: function (content: string, node: Node, options: TurndownService.Options) {
      if (!(node instanceof HTMLElement)) return content;

      // Handle task list items
      const isTaskListItem = node.classList.contains('task-list-item');
      const checkbox = node.querySelector('input[type="checkbox"]') as HTMLInputElement | null;
      let taskListMarker = '';
      
      if (isTaskListItem && checkbox) {
        // Remove the checkbox from content since we'll add markdown checkbox
        content = content.replace(/<input[^>]*>/, '');
        taskListMarker = checkbox.checked ? '[x] ' : '[ ] ';
      }

      content = content
        // Remove trailing newlines
        .replace(/\n+$/, '')
        // Split into lines
        .split('\n')
        // Remove empty lines
        .filter(line => line.length > 0)
        // Add indentation to continued lines
        .join('\n\t');

      let prefix = options.bulletListMarker + ' ';
      let parent = node.parentNode;

      // Calculate the nesting level
      let level = 0;
      let currentParent = node.parentNode;
      while (currentParent && (currentParent.nodeName === 'UL' || currentParent.nodeName === 'OL')) {
        level++;
        currentParent = currentParent.parentNode;
      }

      // Add tab indentation based on nesting level, ensuring it's never negative
      const indentLevel = Math.max(0, level - 1);
      prefix = '\t'.repeat(indentLevel) + prefix;

      if (parent instanceof HTMLOListElement) {
        let start = parent.getAttribute('start');
        let index = Array.from(parent.children).indexOf(node as HTMLElement) + 1;
        prefix = '\t'.repeat(level - 1) + (start ? Number(start) + index - 1 : index) + '. ';
      }

      return prefix + taskListMarker + content.trim() + (node.nextSibling && !/\n$/.test(content) ? '\n' : '');
    }
  });

  // Enhanced table handling
  turndownService.addRule('table', {
    filter: 'table',
    replacement: function(content, node) {
      if (!(node instanceof HTMLTableElement)) return content;

      // Check if the table has colspan or rowspan
      const hasComplexStructure = Array.from(node.querySelectorAll('td, th')).some(cell => 
        cell.hasAttribute('colspan') || cell.hasAttribute('rowspan')
      );

      if (hasComplexStructure) {
        // For complex tables, return HTML
        return '\n\n' + cleanupTableHTML(node) + '\n\n';
      }

      // Process simple tables as markdown
      const rows = Array.from(node.rows).map(row => {
        const cells = Array.from(row.cells).map(cell => {
          // Remove newlines and trim the content
          let cellContent = turndownService.turndown(cell.innerHTML)
            .replace(/\n/g, ' ')
            .trim();
          // Escape pipe characters
          cellContent = cellContent.replace(/\|/g, '\\|');
          return cellContent;
        });
        return `| ${cells.join(' | ')} |`;
      });

      // Create the separator row
      const separatorRow = `| ${Array(rows[0].split('|').length - 2).fill('---').join(' | ')} |`;

      // Combine all rows
      const tableContent = [rows[0], separatorRow, ...rows.slice(1)].join('\n');

      return `\n\n${tableContent}\n\n`;
    }
  });

  // Math support (inline and block)
  turndownService.addRule('math', {
    filter: (node) => {
      return node.nodeName.toLowerCase() === 'math' || 
        (node instanceof Element && node.classList && 
        (node.classList.contains('mwe-math-element') || 
        node.classList.contains('mwe-math-fallback-image-inline') || 
        node.classList.contains('mwe-math-fallback-image-display')));
    },
    replacement: (content, node) => {
      if (!(node instanceof Element)) return content;

      let latex = extractLatex(node);
      latex = latex.trim();

      if (!latex) return content;

      // Determine if it's display math or inline math
      const isDisplayMath = node.classList.contains('mwe-math-fallback-image-display') ||
        (node instanceof HTMLElement && node.style.display === 'block');

      if (isDisplayMath) {
        return `\n\n$$\n${latex}\n$$\n\n`;
      } else {
        // For inline math, add spaces if needed
        const prevNode = node.previousSibling;
        const nextNode = node.nextSibling;
        const prevChar = prevNode?.textContent?.slice(-1) || '';
        const nextChar = nextNode?.textContent?.[0] || '';

        const isStartOfLine = !prevNode || (prevNode.nodeType === Node.TEXT_NODE && prevNode.textContent?.trim() === '');
        const isEndOfLine = !nextNode || (nextNode.nodeType === Node.TEXT_NODE && nextNode.textContent?.trim() === '');

        const leftSpace = (!isStartOfLine && prevChar && !/[\s$]/.test(prevChar)) ? ' ' : '';
        const rightSpace = (!isEndOfLine && nextChar && !/[\s$]/.test(nextChar)) ? ' ' : '';

        return `${leftSpace}$${latex}$${rightSpace}`;
      }
    }
  });

  // Callouts/Alerts (GitHub-style alerts -> Obsidian callouts)
  turndownService.addRule('callout', {
    filter: (node) => {
      return (
        node.nodeName.toLowerCase() === 'div' && 
        (node as HTMLElement).classList.contains('markdown-alert')
      );
    },
    replacement: (content, node) => {
      const element = node as HTMLElement;
      
      // Get alert type from the class (e.g., markdown-alert-note -> NOTE)
      const alertClasses = Array.from(element.classList);
      const typeClass = alertClasses.find(c => c.startsWith('markdown-alert-') && c !== 'markdown-alert');
      const type = typeClass ? typeClass.replace('markdown-alert-', '').toUpperCase() : 'NOTE';

      // Find the title element and content
      const titleElement = element.querySelector('.markdown-alert-title');
      const contentElement = element.querySelector('p:not(.markdown-alert-title)');
      
      // Extract content, removing the title from it if present
      let alertContent = content;
      if (titleElement && titleElement.textContent) {
        alertContent = contentElement?.textContent || content.replace(titleElement.textContent, '');
      }

      // Format as Obsidian callout
      return `\n> [!${type}]\n> ${alertContent.trim().replace(/\n/g, '\n> ')}\n`;
    }
  });

  // YouTube and Twitter embeds -> clickable links
  turndownService.addRule('embedToMarkdown', {
    filter: function (node: Node): boolean {
      if (node instanceof HTMLIFrameElement) {
        const src = node.getAttribute('src');
        return !!src && (
          !!src.match(/(?:youtube\.com|youtu\.be)/) ||
          !!src.match(/(?:twitter\.com|x\.com)/)
        );
      }
      return false;
    },
    replacement: function (content: string, node: Node): string {
      if (node instanceof HTMLIFrameElement) {
        const src = node.getAttribute('src');
        if (src) {
          const youtubeMatch = src.match(/(?:https?:\/\/)?(?:www\.)?(?:youtube\.com|youtu\.be)\/(?:embed\/|watch\?v=)?([a-zA-Z0-9_-]+)/);
          if (youtubeMatch) {
            return `[YouTube Video](https://www.youtube.com/watch?v=${youtubeMatch[1]})`;
          }
          
          const twitterMatch = src.match(/(?:twitter\.com|x\.com)/);
          if (twitterMatch) {
            return `[Twitter/X Embed](${src})`;
          }
        }
      }
      return content;
    }
  });

  // Remove unwanted elements
  turndownService.remove(['style', 'script', 'button']);
  
  // Keep certain elements as HTML
  turndownService.keep(['iframe', 'video', 'audio', 'sup', 'sub', 'svg']);
}

/**
 * Helper function to clean up table HTML for complex tables
 */
function cleanupTableHTML(table: HTMLTableElement): string {
  const allowedAttributes = ['src', 'href', 'style', 'align', 'width', 'height', 'rowspan', 'colspan', 'bgcolor', 'scope', 'valign', 'headers'];
  
  const cleanElement = (element: Element) => {
    Array.from(element.attributes).forEach(attr => {
      if (!allowedAttributes.includes(attr.name)) {
        element.removeAttribute(attr.name);
      }
    });
    
    element.childNodes.forEach(child => {
      if (child instanceof Element) {
        cleanElement(child);
      }
    });
  };

  // Create a clone of the table to avoid modifying the original DOM
  const tableClone = table.cloneNode(true) as HTMLTableElement;
  cleanElement(tableClone);

  return tableClone.outerHTML;
}

/**
 * Helper function to extract LaTeX from math elements
 */
function extractLatex(element: Element): string {
  // Check if the element is a <math> element and has an alttext attribute
  if (element.nodeName.toLowerCase() === 'math') {
    let latex = element.getAttribute('data-latex');
    let alttext = element.getAttribute('alttext');
    if (latex) {
      return latex.trim();
    } else if (alttext) {
      return alttext.trim();
    }
  }

  // If not, look for a nested <math> element with alttext
  const mathElement = element.querySelector('math[alttext]');
  if (mathElement) {
    const alttext = mathElement.getAttribute('alttext');
    if (alttext) {
      return alttext.trim();
    }
  }

  const annotation = element.querySelector('annotation[encoding="application/x-tex"]');
  if (annotation?.textContent) {
    return annotation.textContent.trim();
  }

  const imgNode = element.querySelector('img');
  return imgNode?.getAttribute('alt') || '';
}
