import type { FragmentClipperOptions } from '../../shared/types/options';
import { DEFAULT_FRAGMENT_CONFIG } from '../clipper/services/fragmentConfig';
import { generateTextFragmentUrl } from '../clipper/utils/textFragment';
import { generateClipperTitle, formatDateTime } from '../clipper/utils/datetime';
import { extractContextFromRange } from '../clipper/services/contextCapture';
import { resolveContextRange, collectListPath } from '../clipper/shared/contextDom';
import { buildAncestorListMarkdown } from '../clipper/shared/contextSerialization';
import { createClipperTurndown } from '../clipper/shared/turndownFactory';
import {
  buildFragmentMarkdown,
  type FragmentMarkdownParams
} from '../clipper/markdown/fragmentBuilder';
import { tryParseUrl } from '../../shared/url';
import type { ExportDestinationMetadata } from '../../shared/exportDestination';

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
    sourceUrl: string;
    resolvedUrl: string;
    exportDestination?: ExportDestinationMetadata;
  };
}

export function extractSelectionClip(params: SelectionClipParams): Promise<SelectionClipResult> {
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

  const originalBaseUri = doc.baseURI ?? undefined;
  const parsedUrl = tryParseUrl(url, originalBaseUri);
  const resolvedUrl = parsedUrl?.href ?? originalBaseUri ?? url;

  const turndown = createClipperTurndown(url);

  const pageTitle = doc.title || parsedUrl?.hostname || 'Untitled';
  const now = new Date();
  const clipTitle = generateClipperTitle(pageTitle, now);
  const clippedAt = formatDateTime(now);
  const fragmentUrl = generateTextFragmentUrl(resolvedUrl, selectedText);

  const contextRange = resolveContextRange(selectionRange);
  const context = contextRange ? extractContextFromRange(contextRange, clipperConfig) : null;
  const listPath = contextRange ? collectListPath(contextRange) : [];
  const ancestorInfo = listPath.length
    ? buildAncestorListMarkdown(listPath, turndown)
    : { markdown: '', depth: listPath.length ? listPath.length - 1 : 0 };

  const baseFragmentParams: Omit<FragmentMarkdownParams, 'userComment'> = {
    pageTitle,
    fragmentUrl,
    clippedAt,
    selectedHtml,
    config: clipperConfig,
    turndown,
    context,
    ancestorMarkdown: ancestorInfo.markdown,
    ancestorDepth: ancestorInfo.depth
  };

  const fragmentParams: FragmentMarkdownParams =
    userComment !== undefined ? { ...baseFragmentParams, userComment } : baseFragmentParams;

  const markdown = buildFragmentMarkdown(fragmentParams);

  return Promise.resolve({
    type: 'clipper',
    title: clipTitle,
    pageTitle,
    markdown,
    meta: {
      url: resolvedUrl,
      fragmentUrl,
      domain: parsedUrl?.hostname ?? '',
      clippedAtISO: clippedAt,
      hasComment: Boolean(userComment?.trim()),
      selectedTextPreview: selectedText.substring(0, 100),
      sourceUrl: url,
      resolvedUrl
    }
  });
}
