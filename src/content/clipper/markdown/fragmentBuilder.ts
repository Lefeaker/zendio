import TurndownService from 'turndown';
import type { FragmentClipperOptions } from '@shared/types/options';
import type { ContextSegments } from '../services/contextCapture';
import {
  appendFootnoteRef,
  buildFootnote,
  buildHighlightSegment,
  cleanBulletArtifacts,
  dedupeListLines,
  ensureLeadingBullet,
  ensureListWrapped,
  formatBeforeHierarchy,
  formatContextSnippet,
  highlightMarkdownBlock,
  normalizeListBullets
} from '../utils/markdown';
import { generateYamlFrontMatter } from '@shared/utils/yamlGenerator';

export interface FragmentMarkdownParams {
  pageTitle: string;
  fragmentUrl: string;
  clippedAt: string;
  selectedHtml: string;
  userComment?: string;
  config: FragmentClipperOptions;
  turndown: TurndownService;
  context?: ContextSegments | null;
  ancestorMarkdown?: string;
  ancestorDepth?: number;
}

export function buildFragmentMarkdown(params: FragmentMarkdownParams): string {
  const {
    pageTitle,
    fragmentUrl,
    clippedAt,
    selectedHtml,
    userComment,
    config,
    turndown,
    context,
    ancestorMarkdown = '',
    ancestorDepth = 0
  } = params;

  const footnote = buildFootnote(userComment);
  const trailingFootnotes: string[] = [];
  let contentMd = '';

  if (config.useFootnoteFormat) {
    if (context && config.captureContext) {
      const beforeContextMarkdown = context.beforeHtml
        ? normalizeListBullets(
            formatContextSnippet(turndown.turndown(ensureListWrapped(context.beforeHtml)))
          )
        : '';
      let afterMarkdown = context.afterHtml
        ? normalizeListBullets(
            formatContextSnippet(turndown.turndown(ensureListWrapped(context.afterHtml)))
          )
        : '';

      const beforeSegments: string[] = [];
      if (ancestorMarkdown) {
        beforeSegments.push(ancestorMarkdown);
      }
      if (beforeContextMarkdown) {
        beforeSegments.push(beforeContextMarkdown);
      }
      const beforeCombined = cleanBulletArtifacts(
        dedupeListLines(beforeSegments.join('\n\n').trim())
      );
      const beforeText = formatBeforeHierarchy(beforeCombined);

      const selectedMarkdown = turndown.turndown(ensureListWrapped(selectedHtml));
      const { block: initialBlock, definition } = buildHighlightSegment(selectedMarkdown, footnote);
      let highlightedBlock = initialBlock;
      if (definition) {
        trailingFootnotes.push(definition);
      }

      highlightedBlock = ensureLeadingBullet(
        cleanBulletArtifacts(normalizeListBullets(highlightedBlock)),
        ancestorDepth
      );
      if (afterMarkdown) {
        afterMarkdown = cleanBulletArtifacts(normalizeListBullets(afterMarkdown));
      }

      const parts: string[] = [];
      if (beforeText) parts.push(beforeText);
      parts.push(highlightedBlock);
      if (afterMarkdown) parts.push(afterMarkdown);

      contentMd = cleanBulletArtifacts(parts.join('\n\n'));

      if (footnote.ref && !footnote.consumed) {
        contentMd = appendFootnoteRef(contentMd, footnote.ref);
        if (footnote.definition) {
          trailingFootnotes.push(footnote.definition);
        }
      }
    } else {
      let highlightBlock = highlightMarkdownBlock(
        turndown.turndown(ensureListWrapped(selectedHtml))
      );
      if (footnote.ref) {
        highlightBlock = appendFootnoteRef(highlightBlock, footnote.ref);
      }
      contentMd = ensureLeadingBullet(cleanBulletArtifacts(normalizeListBullets(highlightBlock)));

      if (footnote.definition) {
        trailingFootnotes.push(footnote.definition);
      }
    }
  } else {
    contentMd = turndown.turndown(selectedHtml);
  }

  let domain: string | undefined;
  try {
    domain = new URL(fragmentUrl).hostname;
  } catch {
    domain = undefined;
  }

  const frontMatter = generateYamlFrontMatter(
    'clipper',
    {
      type: 'clipper',
      title: pageTitle,
      url: fragmentUrl,
      clipped_at: clippedAt,
      tags: ['clipping']
    },
    {
      ...(domain !== undefined && { domain })
    }
  );

  let markdown = `${frontMatter}\n\n${contentMd}`;

  if (trailingFootnotes.length) {
    markdown += `\n\n${trailingFootnotes.join('\n\n')}`;
  }

  if (!config.useFootnoteFormat && userComment?.trim()) {
    markdown += `
---

## 💭 我的评论

${userComment.trim()}
`;
  }

  return markdown;
}
