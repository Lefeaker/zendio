import type { BilibiliSelectionHelpers } from './bilibiliPlatformSelection';

export function findBilibiliTextRangeAcrossShadowRoots(
  text: string,
  helpers: BilibiliSelectionHelpers
): Range | null {
  const shadowRoots = collectAllShadowRoots(helpers.document);
  for (const root of shadowRoots) {
    const range = searchInShadowRoot(root, text, helpers);
    if (range) {
      return range;
    }
  }
  return null;
}

function collectAllShadowRoots(doc: Document): ShadowRoot[] {
  const roots: ShadowRoot[] = [];
  const visited = new Set<ShadowRoot>();

  const traverse = (node: Node) => {
    if (node instanceof Element && node.shadowRoot && !visited.has(node.shadowRoot)) {
      roots.push(node.shadowRoot);
      visited.add(node.shadowRoot);
      Array.from(node.shadowRoot.querySelectorAll('*')).forEach(traverse);
    }
    Array.from(node.childNodes).forEach(traverse);
  };

  const root = doc.documentElement;
  if (root) {
    traverse(root);
  }
  return roots;
}

function searchInShadowRoot(
  root: ShadowRoot,
  text: string,
  helpers: BilibiliSelectionHelpers
): Range | null {
  const normalizedChars: Array<{ node: Text; offset: number }> = [];
  const normalizedBuilder: string[] = [];
  const normalizedLowerBuilder: string[] = [];
  let lastWasWhitespace = true;

  const walker = helpers.document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      if (helpers.shouldSkipTextNode(node as Text)) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    const textContent = node.textContent;
    if (!textContent) {
      continue;
    }
    for (let index = 0; index < textContent.length; index += 1) {
      const char = textContent[index];
      if (helpers.isWhitespace(char)) {
        if (normalizedBuilder.length === 0 || lastWasWhitespace) {
          continue;
        }
        normalizedBuilder.push(' ');
        normalizedLowerBuilder.push(' ');
        normalizedChars.push({ node, offset: index });
        lastWasWhitespace = true;
      } else {
        normalizedBuilder.push(char);
        normalizedLowerBuilder.push(char.toLowerCase());
        normalizedChars.push({ node, offset: index });
        lastWasWhitespace = false;
      }
    }
  }

  while (normalizedBuilder.length && normalizedBuilder[normalizedBuilder.length - 1] === ' ') {
    normalizedBuilder.pop();
    normalizedLowerBuilder.pop();
    normalizedChars.pop();
  }

  if (!normalizedBuilder.length) {
    return null;
  }

  const normalizedDocument = normalizedLowerBuilder.join('');
  const target = text.toLowerCase();
  const startIndex = normalizedDocument.indexOf(target);
  if (startIndex === -1) {
    return null;
  }

  const endIndex = startIndex + target.length - 1;
  const startChar = normalizedChars[startIndex];
  const endChar = normalizedChars[endIndex];
  if (!startChar || !endChar) {
    return null;
  }

  const range = helpers.document.createRange();
  range.setStart(startChar.node, startChar.offset);
  range.setEnd(endChar.node, endChar.offset + 1);
  return range;
}
