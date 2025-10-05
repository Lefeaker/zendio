import type { FragmentClipperOptions } from '../../shared/types/options';
import { generateTextFragmentUrl } from '../clipper/utils/textFragment';
import { generateClipperTitle, formatDateTime } from '../clipper/utils/datetime';
import { extractContextFromRange } from '../clipper/services/contextCapture';
import { resolveContextRange, collectListPath } from '../clipper/shared/contextDom';
import { buildAncestorListMarkdown } from '../clipper/shared/contextSerialization';
import { escapeQuotes } from '../shared/markdown';
import { createClipperTurndown } from '../clipper/shared/turndownFactory';
import { buildFragmentMarkdown } from '../clipper/markdown/fragmentBuilder';

export interface SelectionClipParams {
  doc: Document;
  url: string;
  selectedHtml: string;
  selectedText: string;
  userComment?: string;
  config: FragmentClipperOptions;
  selectionRange?: Selection | Range | null;
}

export interface SelectionClipResult {
  type: 'clipper';
  title: string;
  pageTitle: string;
  markdown: string;
  meta: {
    url: string;
    fragmentUrl: string;
    domain: string;
    clippedAtISO: string;
    hasComment: boolean;
    selectedTextPreview: string;
  };
}

const DEFAULT_FRAGMENT_CONFIG: FragmentClipperOptions = {
  useFootnoteFormat: true,
  captureContext: false,
  contextLength: 200,
  contextMode: 'chars'
};

export async function extractSelectionClip(params: SelectionClipParams): Promise<SelectionClipResult> {
  const {
    doc,
    url,
    selectedHtml,
    selectedText,
    userComment,
    config = DEFAULT_FRAGMENT_CONFIG,
    selectionRange
  } = params;

  const clipperConfig: FragmentClipperOptions = {
    ...DEFAULT_FRAGMENT_CONFIG,
    ...config
  };

  const turndown = createClipperTurndown(url);

  const pageTitle = doc.title || new URL(url).hostname;
  const now = new Date();
  const clipTitle = generateClipperTitle(pageTitle, now);
  const clippedAt = formatDateTime(now);
  const fragmentUrl = generateTextFragmentUrl(url, selectedText);

  const contextRange = resolveContextRange(selectionRange);
  const context = contextRange ? extractContextFromRange(contextRange, clipperConfig) : null;
  const listPath = contextRange ? collectListPath(contextRange) : [];
  const ancestorInfo = listPath.length
    ? buildAncestorListMarkdown(listPath, turndown)
    : { markdown: '', depth: listPath.length ? listPath.length - 1 : 0 };

  const markdown = buildFragmentMarkdown({
    pageTitle,
    fragmentUrl,
    clippedAt,
    selectedHtml,
    userComment,
    config: clipperConfig,
    turndown,
    context,
    ancestorMarkdown: ancestorInfo.markdown,
    ancestorDepth: ancestorInfo.depth
  });

  return {
    type: 'clipper',
    title: clipTitle,
    pageTitle,
    markdown,
    meta: {
      url,
      fragmentUrl,
      domain: new URL(url).hostname,
      clippedAtISO: clippedAt,
      hasComment: Boolean(userComment?.trim()),
      selectedTextPreview: selectedText.substring(0, 100)
    }
  };
}
