import type { FragmentClipperOptions } from '@shared/types/options';
import { findPreviousBlockElement, getCleanTextContent } from '../shared/contextDom';
import { wrapListFragment, serializeFragment, serializeElement } from '../shared/contextSerialization';

const CONTEXT_CONTAINER_PRIORITY: Record<string, number> = {
  li: 1,
  blockquote: 2,
  section: 3,
  article: 3,
  main: 3,
  div: 4,
  p: 5
};

interface ContextSegment {
  html: string;
  textLength: number;
}

export interface ContextSegments {
  beforeHtml: string;
  selectedText: string;
  afterHtml: string;
}

export function extractContextFromRange(
  range: Range,
  config: FragmentClipperOptions
): ContextSegments | null {
  if (!config.captureContext) {
    return null;
  }

  const trimmedSelectedText = range.toString().trim();
  if (!trimmedSelectedText) {
    return null;
  }

  const container = resolveContextContainer(range);
  if (!container) {
    return null;
  }

  const contextLimit = calculateContextLimit(config, trimmedSelectedText.length);
  if (contextLimit <= 0) {
    return {
      beforeHtml: '',
      selectedText: trimmedSelectedText,
      afterHtml: ''
    };
  }

  const { segments: beforeSegments, remaining: remainingAfterBefore } = collectBeforeSegments(range, container, contextLimit);
  const { segments: afterSegments } = collectAfterSegments(range, container, remainingAfterBefore);

  return {
    beforeHtml: joinSegments(beforeSegments, true),
    selectedText: trimmedSelectedText,
    afterHtml: joinSegments(afterSegments, false)
  };
}

function resolveContextContainer(range: Range): Element | null {
  let container: Node | null = range.commonAncestorContainer;

  if (container.nodeType === Node.TEXT_NODE) {
    container = container.parentElement || container;
  }

  let contextContainer: Element | null = container as Element;
  let bestContainer: Element | null = null;

  while (contextContainer && contextContainer !== document.body) {
    const tagName = contextContainer.tagName?.toLowerCase();
    if (tagName && tagName in CONTEXT_CONTAINER_PRIORITY) {
      if (
        !bestContainer ||
        CONTEXT_CONTAINER_PRIORITY[tagName] <
          CONTEXT_CONTAINER_PRIORITY[bestContainer.tagName.toLowerCase()]
      ) {
        bestContainer = contextContainer;
      }

      if (tagName === 'li' || tagName === 'article' || tagName === 'section' || tagName === 'main') {
        break;
      }
    }
    contextContainer = contextContainer.parentElement;
  }

  const candidate = bestContainer || (container as Element);
  if (!candidate) {
    return null;
  }

  if (
    !candidate.contains(range.startContainer) ||
    !candidate.contains(range.endContainer)
  ) {
    return null;
  }

  return candidate;
}

function calculateContextLimit(config: FragmentClipperOptions, selectedLength: number): number {
  const baseLength = Math.max(config.contextLength || 0, 0);
  const mode = config.contextMode || 'chars';
  return mode === 'chars' ? Math.max(baseLength - selectedLength, 0) : baseLength;
}

function collectBeforeSegments(range: Range, container: Element, limit: number): { segments: ContextSegment[]; remaining: number } {
  const segments: ContextSegment[] = [];
  let remaining = limit;

  if (remaining > 0) {
    remaining = collectLeadingRangeSegments(segments, remaining, () => {
      const beforeRange = range.cloneRange();
      beforeRange.setStart(container, 0);
      beforeRange.setEnd(range.startContainer, range.startOffset);
      return beforeRange;
    }, (fragment, text, tagName) => tagName === 'li'
      ? wrapListFragment(container, fragment)
      : serializeFragment(fragment));
  }

  if (remaining > 0) {
    remaining = collectSiblingSegments(range, segments, remaining, true);
  }

  if (remaining > 0) {
    remaining = collectAncestorSegments(range, container, segments, remaining, true);
  }

  return { segments, remaining };
}

function collectAfterSegments(range: Range, container: Element, limit: number): { segments: ContextSegment[]; remaining: number } {
  const segments: ContextSegment[] = [];
  let remaining = limit;

  if (remaining > 0) {
    remaining = collectLeadingRangeSegments(segments, remaining, () => {
      const afterRange = range.cloneRange();
      afterRange.setStart(range.endContainer, range.endOffset);
      afterRange.setEnd(container, container.childNodes.length);
      return afterRange;
    }, (fragment, text, tagName) => tagName === 'li'
      ? wrapListFragment(container, fragment)
      : serializeFragment(fragment));
  }

  if (remaining > 0) {
    remaining = collectAncestorSegments(range, container, segments, remaining, false);
  }

  if (remaining > 0) {
    let nextSibling = container.nextElementSibling;
    while (nextSibling && remaining > 0) {
      const siblingText = getCleanTextContent(nextSibling).trim();
      if (siblingText) {
        segments.push({ html: serializeElement(nextSibling), textLength: siblingText.length });
        remaining -= siblingText.length;
      }
      nextSibling = nextSibling.nextElementSibling;
    }
  }

  return { segments, remaining };
}

function collectLeadingRangeSegments(
  segments: ContextSegment[],
  remaining: number,
  rangeFactory: () => Range,
  htmlRenderer: (fragment: DocumentFragment, text: string, tagName: string) => string
): number {
  try {
    const range = rangeFactory();
    const text = range.toString().trim();
    if (!text) {
      return remaining;
    }
    const fragment = range.cloneContents();
    const container = range.startContainer instanceof Element ? range.startContainer : range.startContainer.parentElement;
    const tagName = container?.tagName.toLowerCase() ?? '';
    segments.push({
      html: htmlRenderer(fragment, text, tagName),
      textLength: text.length
    });
    return remaining - text.length;
  } catch {
    return remaining;
  }
}

function collectSiblingSegments(range: Range, segments: ContextSegment[], remaining: number, before: boolean): number {
  let reference: Element | null = before ? findPreviousBlockElement(range) : null;
  while (reference && remaining > 0) {
    const blockTextLength = getCleanTextContent(reference).trim().length;
    if (blockTextLength) {
      segments.push({
        html: serializeElement(reference),
        textLength: blockTextLength
      });
      remaining -= blockTextLength;
    }
    reference = reference.previousElementSibling;
  }
  return remaining;
}

function collectAncestorSegments(
  range: Range,
  container: Element,
  segments: ContextSegment[],
  remaining: number,
  before: boolean
): number {
  let current: Element | null = container;
  while (current && current !== document.body && remaining > 0) {
    const parent: HTMLElement | null = current.parentElement;
    if (!parent || parent === document.body) {
      break;
    }

    const parentTag = parent.tagName.toLowerCase();
    if (!['li', 'blockquote'].includes(parentTag)) {
      current = parent;
      continue;
    }

    try {
      const parentRange = range.cloneRange();
      if (before) {
        parentRange.setStart(parent, 0);
        parentRange.setEndBefore(current);
      } else {
        parentRange.setStartAfter(current);
        parentRange.setEnd(parent, parent.childNodes.length);
      }
      const parentText = parentRange.toString().trim();
      if (parentText) {
        const fragment = parentRange.cloneContents();
        const parentHtml = parentTag === 'li'
          ? wrapListFragment(parent, fragment)
          : serializeFragment(fragment);
        segments.push({
          html: parentHtml,
          textLength: parentText.length
        });
        remaining -= parentText.length;
        if (remaining <= 0) {
          break;
        }
      }
    } catch {
      // ignore
    }
    current = parent;
  }
  return remaining;
}

function joinSegments(segments: ContextSegment[], reverse: boolean): string {
  if (!segments.length) {
    return '';
  }
  const list = reverse ? segments.slice().reverse() : segments;
  return list.map(segment => segment.html).join('');
}









