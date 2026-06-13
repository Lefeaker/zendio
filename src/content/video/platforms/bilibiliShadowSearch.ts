import type { BilibiliSelectionHelpers } from './bilibiliSelectionTypes';
import {
  BILIBILI_COMMENT_SHADOW_HOST_SELECTOR,
  isBilibiliCommentRegionNode
} from './bilibiliCommentRestoreScope';

export function findBilibiliTextRangeAcrossShadowRoots(
  text: string,
  helpers: BilibiliSelectionHelpers,
  roots: readonly ShadowRoot[]
): Range | null {
  for (const root of roots) {
    const range = searchInNode(root, text, helpers);
    if (range) {
      return range;
    }
  }
  return null;
}

export function findBilibiliTextRangeAcrossScopedNodes(
  text: string,
  helpers: BilibiliSelectionHelpers,
  roots: readonly Node[]
): Range | null {
  for (const root of roots) {
    const range = searchInNode(root, text, helpers);
    if (range) {
      return range;
    }
  }
  return null;
}

function searchInNode(root: Node, text: string, helpers: BilibiliSelectionHelpers): Range | null {
  const normalizedChars: Array<{ node: Text; offset: number }> = [];
  const normalizedBuilder: string[] = [];
  const normalizedLowerBuilder: string[] = [];
  let lastWasWhitespace = true;

  const appendTextNode = (node: Text): void => {
    const textContent = node.textContent;
    if (!textContent) {
      return;
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
  };

  traverseShadowInclusive(root, (node) => {
    if (!(node instanceof Text)) {
      return;
    }
    if (helpers.shouldSkipTextNode(node)) {
      return;
    }
    appendTextNode(node);
  });

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

function traverseShadowInclusive(node: Node, visitor: (node: Node) => void): void {
  visitor(node);
  if (node instanceof Element && shouldTraverseNestedShadowRoot(node)) {
    traverseShadowInclusive(node.shadowRoot, visitor);
  }
  for (let child = node.firstChild; child; child = child.nextSibling) {
    traverseShadowInclusive(child, visitor);
  }
}

function shouldTraverseNestedShadowRoot(
  node: Element
): node is HTMLElement & { shadowRoot: ShadowRoot } {
  return (
    node instanceof HTMLElement &&
    node.shadowRoot !== null &&
    node.matches(BILIBILI_COMMENT_SHADOW_HOST_SELECTOR) &&
    isBilibiliCommentRegionNode(node)
  );
}
