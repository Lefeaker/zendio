import TurndownService from 'turndown';

export function registerMarkdownCodeRules(turndownService: TurndownService): void {
  turndownService.addRule('math', {
    filter: (node: HTMLElement) => {
      return (
        node.nodeName.toLowerCase() === 'math' ||
        (node instanceof Element &&
          node.classList &&
          (node.classList.contains('mwe-math-element') ||
            node.classList.contains('mwe-math-fallback-image-inline') ||
            node.classList.contains('mwe-math-fallback-image-display')))
      );
    },
    replacement: (content: string, node: Node) => {
      if (!(node instanceof Element)) return content;

      let latex = extractLatex(node);
      latex = latex.trim();

      if (!latex) return content;

      const isDisplayMath =
        node.classList.contains('mwe-math-fallback-image-display') ||
        (node instanceof HTMLElement && node.style.display === 'block');

      if (isDisplayMath) {
        return `\n\n$$\n${latex}\n$$\n\n`;
      }

      const prevNode = node.previousSibling;
      const nextNode = node.nextSibling;
      const prevChar = prevNode?.textContent?.slice(-1) || '';
      const nextChar = nextNode?.textContent?.[0] || '';

      const isStartOfLine =
        !prevNode || (prevNode.nodeType === Node.TEXT_NODE && prevNode.textContent?.trim() === '');
      const isEndOfLine =
        !nextNode || (nextNode.nodeType === Node.TEXT_NODE && nextNode.textContent?.trim() === '');

      const leftSpace = !isStartOfLine && prevChar && !/[\s$]/.test(prevChar) ? ' ' : '';
      const rightSpace = !isEndOfLine && nextChar && !/[\s$]/.test(nextChar) ? ' ' : '';

      return `${leftSpace}$${latex}$${rightSpace}`;
    }
  });
}

function extractLatex(element: Element): string {
  if (element.nodeName.toLowerCase() === 'math') {
    const latex = element.getAttribute('data-latex');
    const alttext = element.getAttribute('alttext');
    if (latex) {
      return latex.trim();
    } else if (alttext) {
      return alttext.trim();
    }
  }

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
