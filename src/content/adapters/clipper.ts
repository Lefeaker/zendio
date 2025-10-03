import TurndownService from 'turndown';
import { applyObsidianRules } from '../../third_party/obsidian-clipper/markdownRules';

interface FragmentClipperConfig {
  useFootnoteFormat: boolean;
  captureContext: boolean;
  contextLength: number;
  contextMode: 'chars' | 'sentences';
}

/**
 * Generate a Text Fragment URL for precise location linking
 * @see https://web.dev/text-fragments/
 *
 * Strategy: Use the first continuous paragraph to ensure matching
 * Text Fragments work best with continuous text without line breaks
 */
function generateTextFragmentUrl(baseUrl: string, selectedText: string): string {
  // Split by double line breaks to get paragraphs
  const paragraphs = selectedText
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0);

  // Use the first substantial paragraph (at least 20 characters)
  let textToUse = '';
  for (const para of paragraphs) {
    // Clean the paragraph: replace multiple spaces/newlines with single space
    const cleaned = para.replace(/\s+/g, ' ').trim();
    if (cleaned.length >= 20) {
      textToUse = cleaned;
      break;
    }
  }

  // Fallback: if no good paragraph found, use the whole text cleaned
  if (!textToUse) {
    textToUse = selectedText.replace(/\s+/g, ' ').trim();
  }

  // Limit length for URL compatibility (300 chars is a good balance)
  if (textToUse.length > 300) {
    textToUse = textToUse.substring(0, 300);
  }

  // Encode the text for URL
  const encodedText = encodeURIComponent(textToUse);

  // Create Text Fragment URL
  return `${baseUrl}#:~:text=${encodedText}`;
}

/**
 * Generate a unique title for the clipped content
 * Format: {pageTitle} {YYYY-MM-DD HH:mm:ss}
 */
function generateClipperTitle(pageTitle: string, now: Date): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');

  return `${pageTitle} ${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

/**
 * Format datetime for YAML
 * Format: YYYY-MM-DD HH:mm:ss
 */
function formatDateTime(date: Date): string {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
}

/**
 * Get clean text content from an element, excluding scripts and styles
 */
function getCleanTextContent(element: Element): string {
  const clone = element.cloneNode(true) as Element;

  // Remove script, style, noscript tags
  clone.querySelectorAll('script, style, noscript, iframe').forEach(el => el.remove());

  return clone.textContent || '';
}

interface FootnoteInfo {
  ref: string;
  definition: string;
  consumed: boolean;
}

function buildFootnote(comment?: string | null): FootnoteInfo {
  if (!comment || !comment.trim()) {
    return { ref: '', definition: '', consumed: false };
  }

  const commentLines = comment.trim().split('\n');
  const formattedComment = commentLines
    .map((line, index) => (index === 0 ? line : `    ${line}`))
    .join('\n');

  return {
    ref: '[^1]',
    definition: `[^1]: ${formattedComment}`,
    consumed: false
  };
}

function appendFootnoteRef(block: string, ref: string): string {
  if (!ref || !block.trim()) {
    return block;
  }

  const lines = block.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim()) {
      lines[i] = `${lines[i]} ${ref}`;
      break;
    }
  }
  return lines.join('\n');
}

function highlightMarkdownLine(line: string): string {
  if (!line.trim()) {
    return line;
  }

  // Handle nested bullet markers (e.g., "* * Item") by delegating to highlight recursively
  const nestedBulletMatch = line.match(/^(\s*)([-*+])\s+(.*)$/);
  if (nestedBulletMatch) {
    const [, indent, bullet, rest] = nestedBulletMatch;

    if (rest.trim().startsWith('-') || rest.trim().startsWith('*') || rest.trim().startsWith('+')) {
      const highlightedInner = highlightMarkdownLine(rest.trim());
      return `${indent}${bullet} ${highlightedInner}`;
    }
  }

  const listMatch = line.match(/^(\s*[-*+]\s+)(.*)$/);
  if (listMatch) {
    return `${listMatch[1]}==${listMatch[2]}==`;
  }

  const orderedListMatch = line.match(/^(\s*\d+[\.)]\s+)(.*)$/);
  if (orderedListMatch) {
    return `${orderedListMatch[1]}==${orderedListMatch[2]}==`;
  }

  const headingMatch = line.match(/^(\s{0,3}#{1,6}\s+)(.*)$/);
  if (headingMatch) {
    return `${headingMatch[1]}==${headingMatch[2]}==`;
  }

  const quoteMatch = line.match(/^(\s*>+\s*)(.*)$/);
  if (quoteMatch) {
    return `${quoteMatch[1]}==${quoteMatch[2]}==`;
  }

  return `==${line}==`;
}

function highlightMarkdownBlock(markdown: string): string {
  return markdown
    .split('\n')
    .map(highlightMarkdownLine)
    .join('\n');
}

function formatContextSnippet(snippet: string): string {
  let cleaned = snippet
    .replace(/\u00A0/g, ' ')
    .replace(/\t/g, '    ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n');

  cleaned = cleaned.replace(/^\n+/, '').replace(/\n+$/, '');

  return cleaned;
}

function collectListPath(range: Range): Element[] {
  let node: Node | null = range.commonAncestorContainer;
  if (node.nodeType === Node.TEXT_NODE) {
    node = node.parentElement || node;
  }

  if (!(node instanceof Element)) {
    return [];
  }

  const currentLi = node.closest('li');
  if (!currentLi) {
    return [];
  }

  const path: Element[] = [];
  let cursor: Element | null = currentLi;
  while (cursor) {
    path.unshift(cursor);
    const parentLi = cursor.parentElement?.closest('li');
    cursor = parentLi || null;
  }
  return path;
}

function findPrecedingSiblingListItem(range: Range): Element | null {
  let node: Node | null = range.commonAncestorContainer;
  while (node && node.nodeType === Node.TEXT_NODE) {
    node = node.parentNode;
  }
  if (!(node instanceof Element)) {
    return null;
  }

  let cursor: Element | null = node as Element;
  while (cursor && cursor !== document.body) {
    if (cursor.previousElementSibling) {
      const prev = cursor.previousElementSibling;
      if (prev.matches('li')) {
        return prev;
      }
    }
    cursor = cursor.parentElement;
  }
  return null;
}

function findPreviousBlockElement(range: Range): Element | null {
  let node: Node | null = range.commonAncestorContainer;
  while (node && node.nodeType === Node.TEXT_NODE) {
    node = node.parentNode;
  }

  if (!(node instanceof Element)) {
    return null;
  }

  let cursor: Element | null = node;
  while (cursor && cursor !== document.body) {
    if (cursor.previousElementSibling) {
      return cursor.previousElementSibling;
    }
    cursor = cursor.parentElement;
  }
  return null;
}

function extractListItemLabel(li: Element, turndown: TurndownService): string {
  const clone = li.cloneNode(true) as Element;
  clone.querySelectorAll('ul, ol').forEach(el => el.remove());

  const wrapper = document.createElement('ul');
  wrapper.appendChild(clone);
  const markdown = turndown.turndown(wrapper.outerHTML).trim();

  return markdown.replace(/^[-*+]\s+/, '').trim();
}

function buildAncestorListMarkdown(
  listPath: Element[],
  turndown: TurndownService
): { markdown: string; depth: number } {
  if (listPath.length === 0) {
    return { markdown: '', depth: 0 };
  }

  const ancestors = listPath.slice(0, -1);
  if (ancestors.length === 0) {
    return { markdown: '', depth: listPath.length - 1 };
  }

  const lines: string[] = [];
  ancestors.forEach((li, index) => {
    const label = extractListItemLabel(li, turndown);
    if (!label) {
      return;
    }
    const indent = '  '.repeat(index);
    lines.push(`${indent}- ${label}`);
  });

  return {
    markdown: lines.join('\n'),
    depth: listPath.length - 1
  };
}

function indentMarkdownBlock(block: string, depth: number): string {
  if (!block || depth <= 0) {
    return block;
  }
  const indent = '  '.repeat(depth);
  return block
    .split('\n')
    .map(line => (line.trim() ? `${indent}${line}` : line))
    .join('\n');
}

function normalizeListBullets(markdown: string): string {
  return markdown.replace(/^(\s*)\*/gm, '$1-');
}

function dedupeListLines(markdown: string): string {
  const seen = new Set<string>();
  const lines = markdown.split('\n');
  const filtered = lines.filter(line => {
    const key = line.trim();
    if (!key) {
      return line.length === 0;
    }
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
  return filtered.join('\n');
}

function formatBeforeHierarchy(markdown: string): string {
  if (!markdown.trim()) {
    return markdown;
  }

  const lines = markdown.split('\n');
  if (!lines.length) {
    return markdown;
  }

  const [first, ...rest] = lines;
  const normalizedFirst = first.replace(/^\s*-\s+/, '').trim();

  if (!rest.length) {
    return normalizedFirst;
  }

  const body = rest
    .map(line => (line.trim() ? (line.startsWith('- ') ? line : `- ${line.trim()}`) : line))
    .join('\n');

  return `${normalizedFirst}\n\n${body}`;
}

function cleanBulletArtifacts(markdown: string): string {
  return markdown
    .replace(/^(\s*-\s*)\* \* \*\s*/gm, '$1')
    .replace(/^(\s*-\s*)\*\s+/gm, '$1');
}

function ensureListWrapped(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) {
    return html;
  }

  if (/^<ul[\s>]/i.test(trimmed) || /^<ol[\s>]/i.test(trimmed)) {
    return html;
  }

  if (/^<li[\s>]/i.test(trimmed)) {
    return `<ul>${trimmed}</ul>`;
  }

  if (trimmed.includes('<li')) {
    return `<ul>${trimmed}</ul>`;
  }

  return html;
}

function ensureLeadingBullet(block: string, depth = 0): string {
  const lines = block.split('\n');
  const indent = '  '.repeat(depth);

  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) {
      continue;
    }
    if (!/^\s*[-*+]\s+/.test(lines[i])) {
      lines[i] = `${indent}- ${lines[i].trim()}`;
    }
    break;
  }

  return lines.join('\n');
}

function buildHighlightSegment(
  selectedMarkdown: string,
  footnote: FootnoteInfo
): { block: string; definition?: string } {
  let block = highlightMarkdownBlock(selectedMarkdown);
  if (footnote.ref) {
    block = appendFootnoteRef(block, footnote.ref);
    footnote.consumed = true;
    return {
      block,
      definition: footnote.definition
    };
  }

  return { block };
}

interface ContextSegments {
  beforeHtml: string;
  selectedText: string;
  afterHtml: string;
}

const CONTEXT_CONTAINER_PRIORITY: Record<string, number> = {
  li: 1,
  blockquote: 2,
  section: 3,
  article: 3,
  main: 3,
  div: 4,
  p: 5
};

function serializeFragment(fragment: DocumentFragment): string {
  if (!fragment.hasChildNodes()) {
    return '';
  }

  const wrapper = document.createElement('div');
  wrapper.appendChild(fragment.cloneNode(true));
  return wrapper.innerHTML;
}

function serializeElement(element: Element): string {
  const clone = element.cloneNode(true) as Element;
  const tagName = clone.tagName.toLowerCase();

  if (tagName === 'li') {
    const parentTag = element.parentElement?.tagName?.toLowerCase() === 'ol' ? 'ol' : 'ul';
    const listWrapper = document.createElement(parentTag || 'ul');
    listWrapper.appendChild(clone);
    return listWrapper.outerHTML;
  }

  return clone.outerHTML;
}

function wrapListFragment(listItem: Element, fragment: DocumentFragment): string {
  const parentTag = listItem.parentElement?.tagName?.toLowerCase() === 'ol' ? 'ol' : 'ul';
  const listWrapper = document.createElement(parentTag || 'ul');
  const listItemClone = listItem.cloneNode(false) as Element;
  listItemClone.appendChild(fragment.cloneNode(true));
  listWrapper.appendChild(listItemClone);
  return listWrapper.outerHTML;
}

/**
 * Extract context around selected text from a range
 */
function extractContextFromRange(
  range: Range,
  config: FragmentClipperConfig
): ContextSegments | null {
  console.log('[extractContext] Called with captureContext:', config.captureContext);

  if (!config.captureContext) {
    console.log('[extractContext] Early return - captureContext:', config.captureContext);
    return null;
  }

  const rawSelectedText = range.toString();
  const trimmedSelectedText = rawSelectedText.trim();

  console.log('[extractContext] Selected text:', trimmedSelectedText.substring(0, 50));

  if (!trimmedSelectedText) {
    console.log('[extractContext] No selected text');
    return null;
  }

  // Get the common ancestor container and choose the most meaningful block
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

  contextContainer = bestContainer || (container as Element);

  if (
    !contextContainer.contains(range.startContainer) ||
    !contextContainer.contains(range.endContainer)
  ) {
    console.warn('[extractContext] Range is outside of the resolved container');
    return null;
  }

  console.log('[extractContext] Container tag:', contextContainer.tagName);

  const contextLimit = Math.max(0, config.contextLength);

  // Collect content within the same container before the selection
  const beforeSegments: { html: string; textLength: number }[] = [];
  let beforeRemaining = contextLimit;

  if (beforeRemaining > 0) {
    const beforeRange = range.cloneRange();
    try {
      beforeRange.setStart(contextContainer, 0);
      beforeRange.setEnd(range.startContainer, range.startOffset);
      const beforeText = beforeRange.toString().trim();
      if (beforeText) {
        const beforeFragment = beforeRange.cloneContents();
        const beforeHtmlSegment = contextContainer.tagName.toLowerCase() === 'li'
          ? wrapListFragment(contextContainer, beforeFragment)
          : serializeFragment(beforeFragment);
        beforeSegments.push({
          html: beforeHtmlSegment,
          textLength: beforeText.length
        });
        beforeRemaining -= beforeText.length;
      }
    } catch (error) {
      console.warn('[extractContext] Unable to capture intra-container before context:', error);
    }
  }

  // Collect previous sibling elements as additional context
  let previousSibling = contextContainer.previousElementSibling;
  while (previousSibling && beforeRemaining > 0) {
    const siblingText = getCleanTextContent(previousSibling).trim();
    if (siblingText) {
      beforeSegments.push({
        html: serializeElement(previousSibling),
        textLength: siblingText.length
      });
      beforeRemaining -= siblingText.length;
    }
    previousSibling = previousSibling.previousElementSibling;
  }

  if (beforeSegments.length === 0) {
    console.log('[extractContext] No intra-container or sibling before segments captured');
  } else {
    console.log('[extractContext] Before segments captured:', beforeSegments.length);
  }

  if (beforeSegments.length === 0 && beforeRemaining > 0) {
    const precedingLi = findPrecedingSiblingListItem(range);
    if (precedingLi) {
      const siblingText = getCleanTextContent(precedingLi).trim();
      if (siblingText) {
        console.log('[extractContext] Captured preceding sibling list item');
        beforeSegments.push({
          html: serializeElement(precedingLi),
          textLength: siblingText.length
        });
        beforeRemaining -= siblingText.length;
      }
    }
  }

  if (beforeSegments.length === 0 && beforeRemaining > 0) {
    const previousBlock = findPreviousBlockElement(range);
    if (previousBlock) {
      const blockText = getCleanTextContent(previousBlock).trim();
      if (blockText) {
        console.log('[extractContext] Captured previous block element:', previousBlock.tagName);
        beforeSegments.push({
          html: previousBlock.outerHTML || blockText,
          textLength: blockText.length
        });
        beforeRemaining -= blockText.length;
      }
    }
  }

  if (beforeRemaining > 0) {
    let current: Element | null = contextContainer;
    while (current && current !== document.body && beforeRemaining > 0) {
      const parent = current.parentElement;
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
        parentRange.setStart(parent, 0);
        parentRange.setEndBefore(current);
        const parentText = parentRange.toString().trim();
        if (parentText) {
          console.log('[extractContext] Captured parent before segment from', parent.tagName);
          const parentFragment = parentRange.cloneContents();
          const parentHtml = parentTag === 'li'
            ? wrapListFragment(parent, parentFragment)
            : serializeFragment(parentFragment);
          beforeSegments.push({
            html: parentHtml,
            textLength: parentText.length
          });
          beforeRemaining -= parentText.length;
          if (beforeRemaining <= 0) {
            break;
          }
        }
      } catch (error) {
        console.warn('[extractContext] Unable to capture parent before context:', error);
      }
      current = parent;
    }
  }

  // Collect content within the same container after the selection
  const afterSegments: { html: string; textLength: number }[] = [];
  let afterRemaining = contextLimit;

  if (afterRemaining > 0) {
    const afterRange = range.cloneRange();
    try {
      afterRange.setStart(range.endContainer, range.endOffset);
      afterRange.setEnd(contextContainer, contextContainer.childNodes.length);
      const afterText = afterRange.toString().trim();
      if (afterText) {
        const afterFragment = afterRange.cloneContents();
        const afterHtmlSegment = contextContainer.tagName.toLowerCase() === 'li'
          ? wrapListFragment(contextContainer, afterFragment)
          : serializeFragment(afterFragment);
        afterSegments.push({
          html: afterHtmlSegment,
          textLength: afterText.length
        });
        afterRemaining -= afterText.length;
      }
    } catch (error) {
      console.warn('[extractContext] Unable to capture intra-container after context:', error);
    }
  }

  if (afterSegments.length === 0) {
    console.log('[extractContext] No intra-container after segments captured');
  } else {
    console.log('[extractContext] After segments captured:', afterSegments.length);
  }

  if (afterRemaining > 0) {
    let current: Element | null = contextContainer;
    while (current && current !== document.body && afterRemaining > 0) {
      const parent = current.parentElement;
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
        parentRange.setStartAfter(current);
        parentRange.setEnd(parent, parent.childNodes.length);
        const parentText = parentRange.toString().trim();
        if (parentText) {
          console.log('[extractContext] Captured parent after segment from', parent.tagName);
          const parentFragment = parentRange.cloneContents();
          const parentHtml = parentTag === 'li'
            ? wrapListFragment(parent, parentFragment)
            : serializeFragment(parentFragment);
          afterSegments.push({
            html: parentHtml,
            textLength: parentText.length
          });
          afterRemaining -= parentText.length;
          if (afterRemaining <= 0) {
            break;
          }
        }
      } catch (error) {
        console.warn('[extractContext] Unable to capture parent after context:', error);
      }
      current = parent;
    }
  }

  // Collect next sibling elements as additional context
  let nextSibling = contextContainer.nextElementSibling;
  while (nextSibling && afterRemaining > 0) {
    const siblingText = getCleanTextContent(nextSibling).trim();
    if (siblingText) {
      afterSegments.push({
        html: serializeElement(nextSibling),
        textLength: siblingText.length
      });
      afterRemaining -= siblingText.length;
    }
    nextSibling = nextSibling.nextElementSibling;
  }

  const beforeHtml = beforeSegments.length
    ? beforeSegments
        .slice()
        .reverse()
        .map(segment => segment.html)
        .join('')
    : '';

  const afterHtml = afterSegments.length
    ? afterSegments.map(segment => segment.html).join('')
    : '';

  console.log('[extractContext] Final context HTML lengths - before:', beforeHtml.length, 'after:', afterHtml.length);

  return {
    beforeHtml,
    selectedText: trimmedSelectedText,
    afterHtml
  };
}

function resolveContextRange(selectionOrRange?: Selection | Range | null): Range | null {
  if (!selectionOrRange) {
    console.log('[extractContext] No selection range provided');
    return null;
  }

  if ('rangeCount' in selectionOrRange) {
    console.log('[extractContext] Selection rangeCount:', selectionOrRange.rangeCount);
    if (selectionOrRange.rangeCount === 0) {
      return null;
    }
    return selectionOrRange.getRangeAt(0).cloneRange();
  }

  console.log('[extractContext] Using provided Range object');
  return selectionOrRange.cloneRange ? selectionOrRange.cloneRange() : selectionOrRange;
}

/**
 * Extract selected content and create a clipper-style markdown
 */
export async function extractClipperContent(
  doc: Document,
  url: string,
  selectedHtml: string,
  selectedText: string,
  userComment?: string,
  config?: FragmentClipperConfig,
  selection?: Selection | Range | null
) {
  // Default config
  const clipperConfig: FragmentClipperConfig = config || {
    useFootnoteFormat: true,
    captureContext: false,
    contextLength: 200,
    contextMode: 'chars'
  };
  const turndown = new TurndownService({ codeBlockStyle: 'fenced' });

  // Apply Obsidian-specific rules
  applyObsidianRules(turndown);

  // Override with our external image rule
  turndown.addRule('imageExternalOnly', {
    filter: 'img',
    replacement: (_content, node: any) => {
      const src = node.getAttribute('src');
      if (!src) return '';
      const abs = new URL(src, url).toString();
      const alt = (node.getAttribute('alt') || '').replace(/\|/g, '-');
      return `![${alt}](${abs})`;
    }
  });

  // Get page title
  const pageTitle = doc.title || new URL(url).hostname;

  // Get current time
  const now = new Date();

  // Generate unique title for this clip (for filename)
  const clipTitle = generateClipperTitle(pageTitle, now);

  // Format datetime for YAML
  const clippedAt = formatDateTime(now);

  // Generate Text Fragment URL for precise location
  const fragmentUrl = generateTextFragmentUrl(url, selectedText);

  let contentMd: string;
  let markdown: string;

  // Check if we should use footnote format
  if (clipperConfig.useFootnoteFormat) {
    // Footnote format (compatible with Sidebar Highlights plugin)

    console.log('[Clipper] Config:', clipperConfig);
    console.log('[Clipper] Selection available:', !!selection);

    // Try to get context if enabled and selection is available
    const contextRange = resolveContextRange(selection);
    const context = contextRange ? extractContextFromRange(contextRange, clipperConfig) : null;
    const listPath = contextRange ? collectListPath(contextRange) : [];
    const ancestorInfo = listPath.length ? buildAncestorListMarkdown(listPath, turndown) : { markdown: '', depth: listPath.length ? listPath.length - 1 : 0 };

    console.log('[Clipper] Context extracted:', context);

    const footnote = buildFootnote(userComment);
    const trailingFootnotes: string[] = [];

    if (context && clipperConfig.captureContext) {
      // With context: show context with highlighted selection
      console.log('[Clipper] Using context mode');

      const beforeContextMarkdown = context.beforeHtml
        ? normalizeListBullets(formatContextSnippet(turndown.turndown(ensureListWrapped(context.beforeHtml))))
        : '';
      let afterText = context.afterHtml
        ? normalizeListBullets(formatContextSnippet(turndown.turndown(ensureListWrapped(context.afterHtml))))
        : '';

      const beforeParts: string[] = [];
      if (ancestorInfo.markdown) {
        beforeParts.push(ancestorInfo.markdown);
      }
      if (beforeContextMarkdown) {
        beforeParts.push(beforeContextMarkdown);
      }
      const beforeCombined = cleanBulletArtifacts(dedupeListLines(beforeParts.join('\n\n').trim()));
      const beforeText = formatBeforeHierarchy(beforeCombined);

      console.log('[Clipper] Context markdown lengths - before:', beforeText.length, 'after:', afterText.length);
      const selectedMarkdown = turndown.turndown(ensureListWrapped(selectedHtml));

      let { block: highlightedBlock, definition } = buildHighlightSegment(selectedMarkdown, footnote);
      if (definition) {
        trailingFootnotes.push(definition);
      }

      highlightedBlock = ensureLeadingBullet(cleanBulletArtifacts(normalizeListBullets(highlightedBlock)), ancestorInfo.depth);

      if (afterText) {
        afterText = cleanBulletArtifacts(normalizeListBullets(afterText));
      }

      console.log('[Clipper] Before:', beforeText.substring(0, 50));
      console.log('[Clipper] Selected markdown:', highlightedBlock.substring(0, 50));
      console.log('[Clipper] After:', afterText.substring(0, 50));

      const parts: string[] = [];
      if (beforeText) parts.push(beforeText);
      parts.push(highlightedBlock);
      if (afterText) parts.push(afterText);

      contentMd = parts.join('\n\n');

      contentMd = cleanBulletArtifacts(contentMd);

      if (footnote.ref && !footnote.consumed) {
        contentMd = appendFootnoteRef(contentMd, footnote.ref);
        if (footnote.definition) {
          trailingFootnotes.push(footnote.definition);
          footnote.definition = '';
        }
        footnote.consumed = true;
      }
    } else {
      // Without context: highlight the selected markdown directly
      console.log('[Clipper] Using simple mode (no context)');
      console.log('[Clipper] Reason - context:', !!context, 'captureContext:', clipperConfig.captureContext);

      let highlightBlock = highlightMarkdownBlock(turndown.turndown(ensureListWrapped(selectedHtml)));
      if (footnote.ref) {
        highlightBlock = appendFootnoteRef(highlightBlock, footnote.ref);
        footnote.consumed = true;
      }

      contentMd = ensureLeadingBullet(cleanBulletArtifacts(normalizeListBullets(highlightBlock)));

      if (footnote.definition) {
        trailingFootnotes.push(footnote.definition);
        footnote.definition = '';
      }
    }

    // Build markdown with footnote format
    markdown = `---
type: clipper
title: "${esc(pageTitle)}"
url: "${fragmentUrl}"
clipped_at: "${clippedAt}"
tags: [clipping, fragment]
---

${contentMd}`;

    if (trailingFootnotes.length) {
      markdown += `\n\n${trailingFootnotes.join('\n\n')}`;
    }

  } else {
    // Original format (with separator and heading)
    contentMd = turndown.turndown(selectedHtml);

    markdown = `---
type: clipper
title: "${esc(pageTitle)}"
url: "${fragmentUrl}"
clipped_at: "${clippedAt}"
tags: [clipping, fragment]
---

${contentMd}
`;

    // Add user comment if provided (at the bottom)
    if (userComment && userComment.trim()) {
      markdown += `
---

## 💭 我的评论

${userComment.trim()}
`;
    }
  }

  return {
    type: 'clipper',
    title: clipTitle,  // Use unique title for filename
    pageTitle,         // Keep original page title
    markdown,
    meta: {
      url,
      fragmentUrl,
      domain: new URL(url).hostname,
      clippedAtISO: now.toISOString(),
      hasComment: !!userComment,
      selectedTextPreview: selectedText.substring(0, 100)
    }
  };
}

const esc = (s: string) => s.replace(/"/g, '\\"');
