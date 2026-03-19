import {
  BaseVideoPlatform,
  type PlatformSelectionInput,
  type PlatformSelectionResult,
  type TimestampBuildContext,
  type VideoPlatformContext
} from './baseVideoPlatform';
import type { VideoFragmentCapture } from '../types';

const BILIBILI_SHADOW_HOST_TAGS = [
  'bili-comment-thread-renderer',
  'bili-comment-renderer',
  'bili-comment-reply-renderer',
  'bili-rich-text',
  'bili-emoji',
  'bili-avatar',
  'bili-at',
  'bili-link',
  'bili-dyn-content'
] as const;

const BILIBILI_COMMENT_HOST_SELECTORS: ReadonlyArray<string> = [...BILIBILI_SHADOW_HOST_TAGS];
const BILIBILI_SHADOW_HOST_TAG_SET = new Set<string>(BILIBILI_COMMENT_HOST_SELECTORS);
const BILIBILI_SHADOW_HOST_SELECTOR = BILIBILI_COMMENT_HOST_SELECTORS.join(',');
const BILIBILI_COMMENT_REGION_SELECTOR = [
  'bili-comment-thread-renderer',
  'bili-comment-renderer',
  'bili-comment-reply-renderer',
  '.comment-list',
  '.comment-list-item',
  '.comment-wrap',
  '.comment-thread',
  '.reply-item',
  '.reply-list',
  '.bb-comment',
  '#comment',
  '#comment-app'
].join(',');

export class BilibiliVideoPlatform extends BaseVideoPlatform {
  private fragmentObserver: MutationObserver | null = null;
  private readonly observedShadowRoots = new WeakSet<ShadowRoot>();
  private readonly pendingShadowHosts = new WeakSet<HTMLElement>();
  private readonly pendingTimeouts = new Set<number>();

  constructor(context: VideoPlatformContext) {
    super('bilibili', context);
  }

  shouldActivate(doc: Document): boolean {
    const hostname = doc.location?.hostname ?? '';
    return hostname.includes('bilibili.com');
  }

  resolveSelection(input: PlatformSelectionInput): PlatformSelectionResult | null {
    let range = input.range ? input.range.cloneRange() : null;
    let selectedText = this.normalizeWhitespace(input.selectedText);
    let selectedHtml = input.selectedHtml.trim();

    if (range && (!selectedText || !selectedHtml)) {
      const fallback = this.extractBilibiliSelection(range);
      if (fallback) {
        if (!selectedText && fallback.text.trim()) {
          selectedText = this.normalizeWhitespace(fallback.text);
        }
        if (!selectedHtml && fallback.html.trim()) {
          selectedHtml = fallback.html;
        }
      }
    }

    if ((!selectedText || !selectedHtml) && input.event) {
      const fallbackFromEvent = this.extractBilibiliSelectionFromEvent(input.event, range);
      if (fallbackFromEvent) {
        if (!selectedText && fallbackFromEvent.text.trim()) {
          selectedText = this.normalizeWhitespace(fallbackFromEvent.text);
        }
        if (!selectedHtml && fallbackFromEvent.html.trim()) {
          selectedHtml = fallbackFromEvent.html;
        }
        if (!range && fallbackFromEvent.range) {
          range = fallbackFromEvent.range.cloneRange();
        }
      }
    }

    if (!selectedText) {
      return null;
    }

    const html = selectedHtml || this.wrapPlainTextAsHtml(selectedText);

    return {
      text: selectedText,
      html,
      ...(range !== null && { range })
    };
  }

  findTextRange(text: string): Range | null {
    const normalized = this.normalizeWhitespace(text);
    if (!normalized) {
      return null;
    }

    const candidates = this.buildSearchCandidates(normalized);
    for (const candidate of candidates) {
      const shadowRange = this.findTextRangeInShadowDOM(candidate);
      if (shadowRange) {
        return shadowRange;
      }
      const range = super.findTextRange(candidate);
      if (range) {
        return range;
      }
    }
    return null;
  }

  highlight(range: Range, captureId: string, fragmentUrl: string): string | undefined {
    this.observeShadowRoots();
    return super.highlight(range, captureId, fragmentUrl);
  }

  restoreHighlight(capture: VideoFragmentCapture): string | undefined {
    this.observeShadowRoots();
    return super.restoreHighlight(capture);
  }

  observeDomChanges(observer: MutationObserver): void {
    this.fragmentObserver = observer;
    this.observeShadowRoots();
  }

  handleMutations(mutations: MutationRecord[]): void {
    let shouldRefresh = false;
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') {
        continue;
      }
      shouldRefresh = true;
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof Element)) {
          return;
        }
        if (this.isPotentialCommentHost(node)) {
          const view = this.document.defaultView ?? window;
          const handle = view.setTimeout(() => {
            this.pendingTimeouts.delete(handle);
            this.observeShadowRoots();
            this.context.scheduleFragmentHighlightRestore();
          }, 100);
          this.pendingTimeouts.add(handle);
        }
      });
    }
    if (shouldRefresh) {
      this.observeShadowRoots();
    }
  }

  buildTimestampUrl(timeSec: number, ctx: TimestampBuildContext): string | null {
    try {
      const baseUrl = new URL(ctx.canonicalUrl || ctx.currentUrl);
      baseUrl.searchParams.set('t', String(timeSec));

      if (!baseUrl.searchParams.has('p')) {
        const activeEpisode = this.document.querySelector<HTMLElement>(
          '.video-episode-card__entry.is-active[data-index]'
        );
        if (activeEpisode) {
          const indexAttr = activeEpisode.dataset.index || activeEpisode.getAttribute('data-index');
          const parsedIndex = indexAttr ? Number.parseInt(indexAttr, 10) : Number.NaN;
          if (Number.isFinite(parsedIndex) && parsedIndex + 1 > 1) {
            baseUrl.searchParams.set('p', String(parsedIndex + 1));
          }
        }
      }

      return baseUrl.toString();
    } catch {
      return null;
    }
  }

  formatVideoTitle(rawTitle: string): string | null {
    const cleaned = rawTitle.replace(/_+哔哩哔哩.*/i, '').trim();
    return cleaned || null;
  }

  dispose(): void {
    const view = this.document.defaultView ?? window;
    for (const handle of this.pendingTimeouts) {
      view.clearTimeout(handle);
    }
    this.pendingTimeouts.clear();
    this.fragmentObserver = null;
  }

  private observeShadowRoots(): void {
    if (!this.fragmentObserver) {
      return;
    }

    try {
      BILIBILI_COMMENT_HOST_SELECTORS.forEach((selector) => {
        const hosts = this.document.querySelectorAll<HTMLElement>(selector);
        hosts.forEach((host) => this.ensureShadowHostObservation(host));
      });

      this.discoverAndObserveShadowHosts();
    } catch (error) {
      console.warn('[BilibiliVideoPlatform] Failed to observe shadow roots:', error);
    }
  }

  private discoverAndObserveShadowHosts(): void {
    if (!BILIBILI_SHADOW_HOST_SELECTOR) {
      return;
    }
    const hosts = this.document.querySelectorAll<HTMLElement>(BILIBILI_SHADOW_HOST_SELECTOR);
    hosts.forEach((host) => {
      try {
        this.ensureShadowHostObservation(host);
      } catch (error) {
        console.warn('[BilibiliVideoPlatform] Failed to observe dynamic shadow host:', error);
      }
    });
  }

  private ensureShadowHostObservation(host: Element): void {
    if (!(host instanceof HTMLElement)) {
      return;
    }
    if (!this.isWithinCommentRegion(host)) {
      return;
    }
    if (host.shadowRoot) {
      this.observeShadowRootRecursive(host.shadowRoot);
      return;
    }
    const tagName = host.tagName.toLowerCase();
    if (!BILIBILI_SHADOW_HOST_TAG_SET.has(tagName)) {
      return;
    }
    if (this.pendingShadowHosts.has(host)) {
      return;
    }
    this.pendingShadowHosts.add(host);
    const MAX_ATTEMPTS = 20;
    const view = this.document.defaultView ?? window;

    const poll = (attempt: number): void => {
      try {
        if (!host.isConnected) {
          this.pendingShadowHosts.delete(host);
          return;
        }
        if (host.shadowRoot) {
          this.pendingShadowHosts.delete(host);
          this.observeShadowRootRecursive(host.shadowRoot);
          return;
        }
        if (attempt >= MAX_ATTEMPTS) {
          this.pendingShadowHosts.delete(host);
          return;
        }
        const handle = view.setTimeout(() => poll(attempt + 1), 160);
        this.pendingTimeouts.add(handle);
      } catch (error) {
        this.pendingShadowHosts.delete(host);
        console.warn('[BilibiliVideoPlatform] Shadow host polling failed:', error);
      }
    };

    const initialHandle = view.setTimeout(() => poll(0), 120);
    this.pendingTimeouts.add(initialHandle);
  }

  private observeShadowRootRecursive(root: ShadowRoot | null): void {
    if (!root) {
      return;
    }
    if (this.observedShadowRoots.has(root)) {
      return;
    }
    this.context.ensureHighlightStyles(root);
    this.context.registerShadowSelectionBridge(root);
    this.context.observeWithFragmentObserver(root, { childList: true, subtree: true });
    this.observedShadowRoots.add(root);

    const nestedHosts = root.querySelectorAll<HTMLElement>(BILIBILI_SHADOW_HOST_SELECTOR);
    nestedHosts.forEach((element) => this.ensureShadowHostObservation(element));
  }

  private isWithinCommentRegion(element: Element): boolean {
    if (!element.isConnected) {
      return false;
    }
    if (element.matches(BILIBILI_COMMENT_REGION_SELECTOR)) {
      return true;
    }
    return Boolean(element.closest(BILIBILI_COMMENT_REGION_SELECTOR));
  }

  private isPotentialCommentHost(element: Element): boolean {
    const tagName = element.tagName?.toLowerCase() ?? '';
    if (tagName.startsWith('bili-comment') || tagName.includes('rich-text')) {
      return true;
    }
    if (element.querySelector('[class*="comment"]')) {
      return true;
    }
    return false;
  }

  private buildSearchCandidates(normalized: string): string[] {
    const variants = new Set<string>();
    if (!normalized) {
      return [];
    }
    variants.add(normalized);

    const strippedEmoji = normalized.replace(/\[[^\]]+\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (strippedEmoji && !variants.has(strippedEmoji)) {
      variants.add(strippedEmoji);
    }

    return Array.from(variants);
  }

  private findTextRangeInShadowDOM(text: string): Range | null {
    const normalized = this.normalizeWhitespace(text);
    if (!normalized) {
      return null;
    }

    const shadowRoots = this.collectAllShadowRoots();
    for (const root of shadowRoots) {
      const range = this.searchInShadowRoot(root, normalized);
      if (range) {
        return range;
      }
    }
    return null;
  }

  private collectAllShadowRoots(): ShadowRoot[] {
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

    const root = this.document.documentElement;
    if (root) {
      traverse(root);
    }
    return roots;
  }

  private searchInShadowRoot(root: ShadowRoot, text: string): Range | null {
    const normalizedChars: Array<{ node: Text; offset: number }> = [];
    const normalizedBuilder: string[] = [];
    const normalizedLowerBuilder: string[] = [];
    let lastWasWhitespace = true;

    const walker = this.document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (this.shouldSkipTextNode(node as Text)) {
            return NodeFilter.FILTER_REJECT;
          }
          return NodeFilter.FILTER_ACCEPT;
        }
      }
    );

    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      const textContent = node.textContent;
      if (!textContent) {
        continue;
      }
      for (let index = 0; index < textContent.length; index += 1) {
        const char = textContent[index];
        if (this.isWhitespace(char)) {
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

    const range = this.document.createRange();
    range.setStart(startChar.node, startChar.offset);
    range.setEnd(endChar.node, endChar.offset + 1);
    return range;
  }

  private extractBilibiliSelection(range: Range): { text: string; html: string } | null {
    const hosts = this.collectBilibiliRichTextHosts(range);
    if (!hosts.length) {
      return null;
    }

    const textSegments: string[] = [];
    const htmlSegments: string[] = [];

    hosts.forEach((host) => {
      const extracted = this.extractTextFromBilibiliRichText(host);
      if (!extracted) {
        return;
      }

      const text = extracted.text.trim();
      const html = extracted.html.trim();
      if (text) {
        textSegments.push(text);
      }
      if (html) {
        htmlSegments.push(html);
      }
    });

    if (!textSegments.length) {
      return null;
    }

    const combinedText = textSegments.join(' ').replace(/\s+/g, ' ').trim();
    const combinedHtml = htmlSegments.length
      ? htmlSegments.map((segment) => `<p>${segment}</p>`).join('')
      : this.wrapPlainTextAsHtml(combinedText);

    return {
      text: combinedText,
      html: combinedHtml
    };
  }

  private collectBilibiliRichTextHosts(range: Range): HTMLElement[] {
    const ordered: HTMLElement[] = [];
    const seen = new Set<HTMLElement>();

    const consider = (node: Node | null) => {
      const rich = this.findContainingBilibiliRichText(node);
      if (rich && !seen.has(rich)) {
        seen.add(rich);
        ordered.push(rich);
      }
    };

    consider(range.startContainer);
    consider(range.endContainer);
    consider(range.commonAncestorContainer);

    return ordered;
  }

  private findContainingBilibiliRichText(node: Node | null): HTMLElement | null {
    const visited = new Set<Node>();
    let current: Node | null = node;

    while (current && !visited.has(current)) {
      visited.add(current);

      if (current instanceof HTMLElement && current.tagName.toLowerCase() === 'bili-rich-text') {
        return current;
      }

      const root = current instanceof Element
        ? current.getRootNode()
        : current instanceof Text
          ? current.parentElement?.getRootNode() ?? null
          : null;

      if (root instanceof ShadowRoot) {
        const host = root.host as HTMLElement | null;
        if (host?.tagName.toLowerCase() === 'bili-rich-text') {
          return host;
        }
        if (host && !visited.has(host)) {
          current = host;
          continue;
        }
      }

      if (current instanceof Text) {
        current = current.parentElement;
      } else if (current instanceof HTMLElement) {
        current = current.parentElement;
      } else {
        current = null;
      }
    }

    return null;
  }

  private extractTextFromBilibiliRichText(host: HTMLElement): { text: string; html: string } | null {
    const dataContent = host.getAttribute('data-content');
    if (dataContent && dataContent.trim()) {
      const parsed = this.parseBilibiliDataContent(dataContent);
      if (parsed) {
        return parsed;
      }
    }

    if (host.shadowRoot) {
      const container = this.resolveBilibiliRichTextContainer(host.shadowRoot);
      const target = container ?? host.shadowRoot;
      const serialized = this.serializeBilibiliRichTextFragment(target);
      if (serialized.text) {
        return serialized;
      }
    }

    const fallback = host.textContent?.trim();
    if (fallback) {
      return {
        text: fallback,
        html: this.escapeHtml(fallback)
      };
    }

    return null;
  }

  private extractBilibiliSelectionFromEvent(
    event: MouseEvent,
    existingRange: Range | null
  ): { text: string; html: string; range?: Range } | null {
    const path = event.composedPath();
    for (const target of path) {
      if (!(target instanceof Node)) {
        continue;
      }
      const host = this.findContainingBilibiliRichText(target);
      if (!host) {
        continue;
      }
      const extracted = this.extractTextFromBilibiliRichText(host);
      if (!extracted || !extracted.text.trim()) {
        continue;
      }
      const range = existingRange ?? this.buildRangeCoveringBilibiliRichText(host);
      return range
        ? { text: extracted.text, html: extracted.html, range }
        : { text: extracted.text, html: extracted.html };
    }
    return null;
  }

  private buildRangeCoveringBilibiliRichText(host: HTMLElement): Range | null {
    const container = host.shadowRoot ? this.resolveBilibiliRichTextContainer(host.shadowRoot) : null;
    const target = container ?? host.shadowRoot ?? host;
    if (!target) {
      return null;
    }
    const textNodes: Text[] = [];
    const walker = this.document.createTreeWalker(
      target,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          if (this.shouldSkipTextNode(node as Text)) {
            return NodeFilter.FILTER_REJECT;
          }
          return node.textContent && node.textContent.trim()
            ? NodeFilter.FILTER_ACCEPT
            : NodeFilter.FILTER_SKIP;
        }
      }
    );
    let current = walker.nextNode() as Text | null;
    while (current) {
      if (current.textContent && current.textContent.trim()) {
        textNodes.push(current);
      }
      current = walker.nextNode() as Text | null;
    }
    if (!textNodes.length) {
      return null;
    }
    const range = this.document.createRange();
    range.setStart(textNodes[0], 0);
    const lastNode = textNodes[textNodes.length - 1];
    range.setEnd(lastNode, lastNode.textContent?.length ?? 0);
    return range;
  }

  private resolveBilibiliRichTextContainer(root: ShadowRoot): HTMLElement | null {
    const selectors = [
      '.rich-text-content',
      '#contents',
      '[id="contents"]',
      '.content',
      '.rich-text'
    ];
    for (const selector of selectors) {
      const element = root.querySelector<HTMLElement>(selector);
      if (element) {
        return element;
      }
    }
    const firstChild = Array.from(root.children).find((element) => {
      const tag = element.tagName.toLowerCase();
      return tag !== 'style' && tag !== 'script' && tag !== 'template';
    });
    return firstChild instanceof HTMLElement ? firstChild : null;
  }

  private parseBilibiliDataContent(raw: string): { text: string; html: string } | null {
    const trimmed = raw.trim();
    if (!trimmed) {
      return null;
    }

    const extractedFromJson = this.tryParseBilibiliContentJson(trimmed);
    const text = (extractedFromJson || trimmed).replace(/\s+/g, ' ').trim();
    if (!text) {
      return null;
    }
    return {
      text,
      html: this.escapeHtml(text)
    };
  }

  private tryParseBilibiliContentJson(raw: string): string | null {
    if (!raw || (raw[0] !== '{' && raw[0] !== '[')) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as unknown;
      const flattened = this.flattenBilibiliContentNode(parsed).trim();
      return flattened || null;
    } catch {
      return null;
    }
  }

  private flattenBilibiliContentNode(node: unknown): string {
    if (node == null) {
      return '';
    }
    if (typeof node === 'string') {
      return node;
    }
    if (typeof node === 'number' || typeof node === 'boolean') {
      return String(node);
    }
    if (Array.isArray(node)) {
      return node.map(item => this.flattenBilibiliContentNode(item)).join('');
    }
    if (typeof node === 'object') {
      const record = node as Record<string, unknown>;
      if (typeof record.text === 'string' && record.text.trim()) {
        return record.text;
      }
      if (typeof record.raw_text === 'string' && record.raw_text.trim()) {
        return record.raw_text;
      }
      if (typeof record.content === 'string' && record.content.trim()) {
        return record.content;
      }
      if (typeof record.display_text === 'string' && record.display_text.trim()) {
        return record.display_text;
      }
      if (typeof record.name === 'string' && record.name.trim()) {
        const type = typeof record.type === 'string' ? record.type.toLowerCase() : '';
        if (type.includes('mention') || type === 'at') {
          const value = record.name;
          return value.startsWith('@') ? value : `@${value}`;
        }
      }
      if (Array.isArray(record.rich_text_nodes)) {
        return (record.rich_text_nodes as unknown[])
          .map(item => this.flattenBilibiliContentNode(item))
          .join('');
      }
      if (Array.isArray(record.ops)) {
        return (record.ops as unknown[])
          .map(item => {
            if (item && typeof item === 'object' && 'insert' in (item as Record<string, unknown>)) {
              return this.flattenBilibiliContentNode((item as Record<string, unknown>).insert);
            }
            return this.flattenBilibiliContentNode(item);
          })
          .join('');
      }
    }
    return '';
  }

  private serializeBilibiliRichTextFragment(root: Element | ShadowRoot): { text: string; html: string } {
    const textParts: string[] = [];
    const htmlParts: string[] = [];

    const append = (raw: string | null | undefined, htmlOverride?: string) => {
      if (raw == null) {
        return;
      }
      if (raw.trim().length === 0) {
        if (raw.length > 0) {
          textParts.push(' ');
          htmlParts.push(' ');
        }
        return;
      }
      textParts.push(raw);
      htmlParts.push(htmlOverride ?? this.escapeHtml(raw));
    };

    const walk = (node: Node): void => {
      if (node.nodeType === Node.TEXT_NODE) {
        append(node.textContent);
        return;
      }
      if (!(node instanceof Element)) {
        return;
      }

      const tagName = node.tagName.toLowerCase();
      if (tagName === 'style' || tagName === 'script' || tagName === 'template') {
        return;
      }

      if (tagName === 'bili-emoji') {
        const emojiText =
          node.getAttribute('data-emoji') ||
          node.getAttribute('alt') ||
          node.getAttribute('title') ||
          ((node as HTMLElement).shadowRoot?.querySelector('img')?.getAttribute('alt')) ||
          node.querySelector('img')?.getAttribute('alt') ||
          node.textContent ||
          '';
        if (emojiText) {
          const escaped = this.escapeHtml(emojiText);
          append(
            emojiText,
            `<span data-aiob-fragment="emoji" data-emoji="${escaped}">${escaped}</span>`
          );
        }
        return;
      }

      if (tagName === 'img') {
        const alt =
          node.getAttribute('data-emoji') ||
          node.getAttribute('alt') ||
          node.getAttribute('title') ||
          node.getAttribute('aria-label') ||
          '';
        if (alt) {
          const escaped = this.escapeHtml(alt);
          append(
            alt,
            `<span data-aiob-fragment="emoji" data-emoji="${escaped}">${escaped}</span>`
          );
          return;
        }
      }

      if (tagName === 'bili-at' || node.matches('.reply-target, .at-user')) {
        const mentionText =
          node.getAttribute('data-user-name') ||
          node.getAttribute('data-name') ||
          node.getAttribute('data-text') ||
          node.textContent ||
          '';
        if (mentionText) {
          const normalized = mentionText.startsWith('@') ? mentionText : `@${mentionText}`;
          const escaped = this.escapeHtml(normalized);
          append(normalized, `<span data-aiob-fragment="mention">${escaped}</span>`);
        }
        return;
      }

      if (tagName === 'bili-link' || tagName === 'a') {
        const hrefRaw =
          node.getAttribute('href') ||
          node.getAttribute('data-href') ||
          node.getAttribute('data-url') ||
          node.getAttribute('data-uri') ||
          '';
        const href = hrefRaw.trim();
        const linkText =
          node.getAttribute('data-title') ||
          node.getAttribute('title') ||
          node.textContent ||
          href;
        if (linkText) {
          const normalized = linkText.trim();
          if (normalized) {
            const escapedText = this.escapeHtml(normalized);
            const html = href
              ? `<a href="${this.escapeHtml(href)}" target="_blank" rel="noopener noreferrer">${escapedText}</a>`
              : escapedText;
            append(normalized, html);
          }
        }
        return;
      }

      if (tagName === 'bili-dyn-content') {
        Array.from(node.childNodes).forEach((child) => walk(child));
        return;
      }

      if (node.matches('.text-node')) {
        append(node.textContent);
        return;
      }

      if (node.childNodes.length === 0) {
        append(node.textContent);
        return;
      }

      Array.from(node.childNodes).forEach((child) => walk(child));
    };

    Array.from(root.childNodes).forEach((child) => walk(child));

    const combined = textParts.join('');
    return {
      text: combined.replace(/\s+/g, ' ').trim(),
      html: htmlParts.join('')
    };
  }
}
