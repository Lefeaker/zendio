import type { ReaderHighlightRecord } from './highlightTypes';

export function unwrapHighlightWrappers(highlight: ReaderHighlightRecord): void {
  for (const wrapper of highlight.wrapperSegments) {
    const parent = wrapper.parentNode;
    if (!parent) {
      continue;
    }
    while (wrapper.firstChild) {
      parent.insertBefore(wrapper.firstChild, wrapper);
    }
    wrapper.remove();
  }
}

export function getPrimaryHighlightWrapper(highlight: ReaderHighlightRecord): HTMLElement | null {
  if (highlight.wrapper.isConnected) {
    return highlight.wrapper;
  }
  for (const segment of highlight.wrapperSegments) {
    if (segment.isConnected) {
      highlight.wrapper = segment;
      return segment;
    }
  }
  return null;
}

export function reconstructHighlightText(highlight: ReaderHighlightRecord): string {
  if (highlight.wrapperSegments.length <= 1) {
    return highlight.selectedText;
  }

  const connectedSegments = highlight.wrapperSegments.filter((segment) => segment.isConnected);
  if (!connectedSegments.length) {
    return highlight.selectedText;
  }

  connectedSegments.sort((a, b) => {
    const indexA = parseInt(a.dataset.segmentIndex || '0', 10);
    const indexB = parseInt(b.dataset.segmentIndex || '0', 10);
    if (a.dataset.segmentIndex && b.dataset.segmentIndex) {
      return indexA - indexB;
    }
    const position = a.compareDocumentPosition(b);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return -1;
    }
    if (position & Node.DOCUMENT_POSITION_PRECEDING) {
      return 1;
    }
    return 0;
  });

  const segmentTexts = connectedSegments.map((segment) => segment.textContent || '');
  let reconstructedText = '';

  for (let i = 0; i < segmentTexts.length; i++) {
    const currentText = segmentTexts[i];
    if (i > 0) {
      const prevText = segmentTexts[i - 1];
      const prevChar = prevText?.slice(-1) ?? '';
      const nextChar = currentText?.charAt(0) ?? '';
      const isAsciiWordChar = (char: string): boolean => /[A-Za-z0-9]/.test(char);
      const isCjkChar = (char: string): boolean => /[\u3400-\u9FFF]/.test(char);
      const needsSpace =
        prevText &&
        currentText &&
        !prevText.endsWith(' ') &&
        !currentText.startsWith(' ') &&
        !prevText.match(/[。，、；：！？）】」』]$/) &&
        !currentText.match(/^[。，、；：！？（【「『]/) &&
        !prevText.match(/[.,:;!?)\]}]$/) &&
        !currentText.match(/^[.,:;!?([{]/) &&
        !(isCjkChar(prevChar) && isCjkChar(nextChar)) &&
        (isAsciiWordChar(prevChar) || isAsciiWordChar(nextChar));
      if (needsSpace) {
        reconstructedText += ' ';
      }
    }
    reconstructedText += currentText;
  }

  const normalizedReconstructed = normalizeText(reconstructedText);
  const normalizedOriginal = normalizeText(highlight.selectedText);

  if (highlight.wrapperSegments.length > 1) {
    if (normalizedReconstructed.length >= normalizedOriginal.length) {
      return reconstructedText;
    }
  }

  if (
    normalizedReconstructed.length > normalizedOriginal.length * 1.1 ||
    (normalizedOriginal.length < 10 && normalizedReconstructed.length > normalizedOriginal.length)
  ) {
    return reconstructedText;
  }

  return highlight.selectedText;
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
