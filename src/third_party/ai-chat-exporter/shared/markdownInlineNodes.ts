import type { MarkdownChildrenProcessor } from './markdownNodeTraversal';

export function renderInlineMarkdownNode(
  elem: HTMLElement,
  tagName: string,
  indent: string,
  processChildren: MarkdownChildrenProcessor
): string | null {
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
    return renderMathNode(elem);
  }

  if (tagName === 'code') {
    return '`' + (elem.textContent || '') + '`';
  }

  if (tagName === 'strong' || tagName === 'b') {
    return renderWrappedInline(elem, indent, processChildren, '**');
  }

  if (tagName === 'em' || tagName === 'i') {
    return renderWrappedInline(elem, indent, processChildren, '*');
  }

  if (tagName === 'a') {
    const href = elem.getAttribute('href') || '';
    const text = processChildren(elem, indent);
    return `[${text}](${href})`;
  }

  if (tagName === 'img') {
    return renderImageNode(elem);
  }

  if (
    tagName === 'image-query' ||
    tagName === 'uploaded-image' ||
    elem.classList.contains('uploaded-image') ||
    elem.classList.contains('image-container')
  ) {
    return renderCustomImageNode(elem);
  }

  return null;
}

function renderWrappedInline(
  elem: HTMLElement,
  indent: string,
  processChildren: MarkdownChildrenProcessor,
  wrapper: '**' | '*'
): string {
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

  return (needSpaceBefore ? ' ' : '') + wrapper + content + wrapper + (needSpaceAfter ? ' ' : '');
}

function renderMathNode(elem: HTMLElement): string {
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

function renderImageNode(elem: HTMLElement): string {
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

function renderCustomImageNode(elem: HTMLElement): string {
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
