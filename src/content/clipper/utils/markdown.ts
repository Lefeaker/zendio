export interface FootnoteInfo {
  ref: string;
  definition: string;
  consumed: boolean;
}

export function buildFootnote(comment?: string | null, index = 1): FootnoteInfo {
  if (!comment || !comment.trim()) {
    return { ref: '', definition: '', consumed: false };
  }

  const safeIndex = Math.max(1, Math.floor(index));
  const commentLines = comment.trim().split('\n');
  const formattedComment = commentLines
    .map((line, index) => (index === 0 ? line : `    ${line}`))
    .join('\n');

  return {
    ref: `[^${safeIndex}]`,
    definition: `[^${safeIndex}]: ${formattedComment}`,
    consumed: false
  };
}

export function appendFootnoteRef(block: string, ref: string): string {
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

export function appendLocatorLink(block: string, url: string): string {
  if (!url || !block.trim()) {
    return block;
  }

  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return block;
  }

  const lines = block.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim()) {
      lines[i] = `${lines[i]}    [](${trimmedUrl})`;
      break;
    }
  }
  return lines.join('\n');
}

function highlightMarkdownLine(line: string): string {
  if (!line.trim()) {
    return line;
  }

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

export function highlightMarkdownBlock(markdown: string): string {
  return markdown
    .split('\n')
    .map(highlightMarkdownLine)
    .join('\n');
}

export function normalizeListBullets(markdown: string): string {
  return markdown.replace(/^(\s*)\*/gm, '$1-');
}

export function dedupeListLines(markdown: string): string {
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

export function cleanBulletArtifacts(markdown: string): string {
  return markdown
    .replace(/^(\s*-\s*)\* \* \*\s*/gm, '$1')
    .replace(/^(\s*-\s*)\*\s+/gm, '$1');
}

export function ensureListWrapped(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) {
    return html;
  }
  if (/^<ul[\s>]/i.test(trimmed) || /^<ol[\s>]/i.test(trimmed)) {
    return html;
  }
  if (/^<li[\s>]/i.test(trimmed) || trimmed.includes('<li')) {
    return `<ul>${trimmed}</ul>`;
  }
  return html;
}

export function formatContextSnippet(snippet: string): string {
  let cleaned = snippet
    .replace(/\u00A0/g, ' ')
    .replace(/\t/g, '    ')
    .replace(/\r/g, '')
    .replace(/\n{3,}/g, '\n\n');

  cleaned = cleaned.replace(/^\n+/, '').replace(/\n+$/, '');
  return cleaned;
}

export function ensureLeadingBullet(block: string, depth = 0): string {
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

export function formatBeforeHierarchy(markdown: string): string {
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

export function buildHighlightSegment(selectedMarkdown: string, footnote: FootnoteInfo): { block: string; definition?: string } {
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
