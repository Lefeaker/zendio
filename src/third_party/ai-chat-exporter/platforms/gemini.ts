import { DEFAULT_CHAT_TITLE } from '../shared/constants';
import { convertBlobImageToBase64 } from '../shared/assets';
import { chatHtmlToMarkdown } from '../shared/markdown';
import type { ChatPlatformParser, ParsedMessage, ParsedResult, ParseConfig } from '../types';

const GEMINI_MESSAGE_ITEM_SELECTOR = 'user-query, model-response';
const GEMINI_SIDEBAR_ACTIVE_CHAT_SELECTOR =
  'div[data-test-id="conversation"].selected .conversation-title';
const GEMINI_TITLE_REPLACE_TEXT = 'Gemini - ';

type DeepResearchSource = {
  href: string;
  text: string;
  title: string;
  domain: string;
};

type SummaryStructure = {
  paragraphs: string[];
  bulletGroups: string[][];
};

const GEMINI_DEEP_RESEARCH_SELECTORS = [
  'deep-research-immersive-panel',
  'deep-research-confirmation-widget',
  'deep-research-processing-indicator'
];

const GEMINI_DEEP_RESEARCH_CLASS_MATCHER = '[class*="deep-research"]';

function queryAllDeep(root: Document | Element, selector: string): Element[] {
  const results: Element[] = [];
  const visited = new Set<Node>();
  const queue: Array<Document | Element | ShadowRoot> = [];

  const enqueue = (node?: Document | Element | ShadowRoot | null) => {
    if (!node || visited.has(node)) return;
    visited.add(node);
    queue.push(node);
  };

  enqueue(root);

  while (queue.length) {
    const current = queue.shift();
    if (!current) continue;

    if ('querySelectorAll' in current) {
      const matches = Array.from(current.querySelectorAll(selector));
      matches.forEach((el) => results.push(el));
    }

    let childElements: Element[] = [];
    if (current instanceof Document) {
      if (current.documentElement) {
        childElements = [current.documentElement];
      }
    } else if (current instanceof ShadowRoot) {
      childElements = Array.from(current.children);
    } else if (current instanceof Element) {
      childElements = Array.from(current.children);
    }

    childElements.forEach((child) => {
      enqueue(child);
      if (child instanceof HTMLElement && child.shadowRoot) {
        enqueue(child.shadowRoot);
      }
    });
  }

  return results;
}

function normalizeTextForComparison(text: string): string {
  return text
    .replace(/\u200B/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function sanitizeSourceText(text: string): string {
  return text
    .replace(/\u200B/g, '')
    .replace(/Opens in a new window/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractDomain(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

function isDeepResearchSession(doc: Document): boolean {
  return Boolean(
    GEMINI_DEEP_RESEARCH_SELECTORS.some((selector) => doc.querySelector(selector)) ||
      doc.querySelector(GEMINI_DEEP_RESEARCH_CLASS_MATCHER)
  );
}

function findDeepResearchPanel(doc: Document): Element | null {
  const panels = queryAllDeep(doc, 'deep-research-immersive-panel');
  return panels.length > 0 ? panels[0] : null;
}

function collectSources(root: Element): DeepResearchSource[] {
  const anchors = queryAllDeep(root, 'a[href]');
  const seen = new Set<string>();
  const sources: DeepResearchSource[] = [];

  anchors.forEach((anchor) => {
    const href = anchor.getAttribute('href') || '';
    if (!href || seen.has(href)) return;
    seen.add(href);

    const rawText = (anchor.textContent || '').replace(/\u200B/g, '');
    const lines = rawText
      .split(/\n+/)
      .map((line) => line.trim())
      .filter(Boolean);
    const text = sanitizeSourceText(rawText);
    const title = lines.length > 0 ? lines[lines.length - 1] : text;

    sources.push({
      href,
      text,
      title,
      domain: extractDomain(href)
    });
  });

  return sources;
}

function collectPlanSteps(messageElem: Element): Array<{ title: string; description: string }> {
  const steps: Array<{ title: string; description: string }> = [];
  const seen = new Set<string>();
  const stepElements = queryAllDeep(messageElem, '.research-step');

  stepElements.forEach((step) => {
    const titleNode = queryAllDeep(step, '.research-step-title')[0] as HTMLElement | undefined;
    const descriptionNode = queryAllDeep(step, '.research-step-description')[0] as
      | HTMLElement
      | undefined;
    const title = titleNode?.textContent?.trim() || '';
    const description = descriptionNode?.textContent?.trim() || '';

    if (title || description) {
      const key = `${title}|||${description}`;
      if (!seen.has(key)) {
        seen.add(key);
        steps.push({ title, description });
      }
    }
  });

  return steps;
}

function extractSummaryStructure(root: Element, sources: DeepResearchSource[]): SummaryStructure {
  const reportHost = queryAllDeep(root, 'message-content')[0] as HTMLElement | undefined;
  const target = reportHost || (root as HTMLElement);
  const rawContent = (target?.innerText || '').replace(/\u200B/g, '');

  if (!rawContent.trim()) {
    return { paragraphs: [], bulletGroups: [] };
  }

  const sourceComparisons = new Set(
    sources.map((source) => normalizeTextForComparison(source.text))
  );

  const lines = rawContent
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => {
      if (!line) return false;
      if (/opens in a new window/i.test(line)) return false;
      const normalized = normalizeTextForComparison(line);
      return !sourceComparisons.has(normalized);
    });

  const paragraphs: string[] = [];
  const bulletGroups: string[][] = [];
  const paragraphSet = new Set<string>();
  const bulletItemSet = new Set<string>();

  let currentParagraph: string[] = [];
  let currentBulletGroup: string[] = [];

  const flushParagraph = () => {
    if (currentParagraph.length === 0) return;
    const paragraph = currentParagraph.join(' ').replace(/\s+/g, ' ').trim();
    if (paragraph && !paragraphSet.has(paragraph)) {
      paragraphSet.add(paragraph);
      paragraphs.push(paragraph);
    }
    currentParagraph = [];
  };

  const flushBullets = () => {
    if (currentBulletGroup.length === 0) return;
    bulletGroups.push(currentBulletGroup.slice());
    currentBulletGroup = [];
  };

  const bulletPattern = /^((?:\d+\.)|(?:\d+\))|(?:[a-z]\))|[-•*])\s+/i;

  for (const line of lines) {
    if (bulletPattern.test(line)) {
      flushParagraph();
      const cleaned = line.replace(bulletPattern, '').trim();
      if (cleaned && !bulletItemSet.has(cleaned)) {
        bulletItemSet.add(cleaned);
        currentBulletGroup.push(cleaned);
      }
      continue;
    }

    if (currentBulletGroup.length > 0) {
      const lastIndex = currentBulletGroup.length - 1;
      const merged = `${currentBulletGroup[lastIndex]} ${line}`.replace(/\s+/g, ' ').trim();
      if (!bulletItemSet.has(merged)) {
        bulletItemSet.add(merged);
        currentBulletGroup[lastIndex] = merged;
      }
      continue;
    }

    currentParagraph.push(line);
    if (/[.!?。！？]$/.test(line) || line.length > 160) {
      flushParagraph();
    }
  }

  flushParagraph();
  flushBullets();

  return {
    paragraphs,
    bulletGroups: bulletGroups.filter((group) => group.length > 0)
  };
}

function applyCitations(text: string, sources: DeepResearchSource[]): string {
  return text.replace(/\[(\d+)\]/g, (match, number) => {
    const index = Number(number);
    const source = sources[index - 1];
    if (!index || !source) {
      return match;
    }
    return `[${number}](${source.href})`;
  });
}

function buildReportMarkdown(doc: Document, messageElem: Element): string | null {
  const hasWidget = queryAllDeep(messageElem, 'deep-research-confirmation-widget').length > 0;
  const panel = findDeepResearchPanel(doc);

  if (!hasWidget && !panel) {
    return null;
  }

  const sources = panel ? collectSources(panel) : [];
  const planSteps = collectPlanSteps(messageElem);
  const summaryElement = panel || (hasWidget ? messageElem : null);
  const summary = summaryElement
    ? extractSummaryStructure(summaryElement, sources)
    : { paragraphs: [], bulletGroups: [] };

  if (
    planSteps.length === 0 &&
    summary.paragraphs.length === 0 &&
    summary.bulletGroups.length === 0 &&
    sources.length === 0
  ) {
    return null;
  }

  const markdownLines: string[] = ['\n---', '**Gemini Deep Research Report**', ''];

  const titleNode = queryAllDeep(messageElem, '[data-test-id="title"]').shift() as
    | HTMLElement
    | undefined;
  const titleText = titleNode?.textContent?.trim();
  if (titleText) {
    markdownLines.push(`# ${titleText}`, '');
  }

  if (planSteps.length > 0) {
    markdownLines.push('## Research Plan', '');
    planSteps.forEach((step, index) => {
      const heading = step.title || `Step ${index + 1}`;
      markdownLines.push(`### ${index + 1}. ${heading}`);
      if (step.description) {
        markdownLines.push('');
        markdownLines.push(applyCitations(step.description, sources));
      }
      markdownLines.push('');
    });
  }

  if (summary.paragraphs.length > 0 || summary.bulletGroups.length > 0) {
    markdownLines.push('## Report Overview', '');

    summary.paragraphs.forEach((paragraph) => {
      const formatted = applyCitations(paragraph, sources);
      if (formatted) {
        markdownLines.push(formatted, '');
      }
    });

    summary.bulletGroups.forEach((group) => {
      const renderedItems: string[] = [];
      group.forEach((item) => {
        const formatted = applyCitations(item, sources);
        if (formatted && !renderedItems.includes(formatted)) {
          renderedItems.push(formatted);
        }
      });
      if (renderedItems.length > 0) {
        renderedItems.forEach((formatted) => {
          markdownLines.push(`- ${formatted}`);
        });
        markdownLines.push('');
      }
    });
  }

  if (sources.length > 0) {
    markdownLines.push('### References', '');
    sources.forEach((source, index) => {
      const label = source.title || source.text || source.domain || source.href;
      const domainText = source.domain ? ` (${source.domain})` : '';
      markdownLines.push(`[${index + 1}] [${label}](${source.href})${domainText}`);
    });
    markdownLines.push('');
  }

  markdownLines.push('---', '');

  return markdownLines.join('\n');
}

const GeminiDeepResearchHelper = {
  SELECTORS: GEMINI_DEEP_RESEARCH_SELECTORS,
  CLASS_MATCHER: GEMINI_DEEP_RESEARCH_CLASS_MATCHER,
  isDeepResearchSession,
  queryAllDeep,
  normalizeTextForComparison,
  sanitizeSourceText,
  extractDomain,
  findDeepResearchPanel,
  collectSources,
  collectPlanSteps,
  extractSummaryStructure,
  applyCitations,
  buildReportMarkdown
};

function extractCanvasContent(doc: Document): string | null {
  const immersivePanel = doc.querySelector(
    'immersive-container, immersive-panel, canvas-immersive-panel'
  );
  if (!immersivePanel) {
    return null;
  }

  const canvasContent = immersivePanel.querySelector(
    'canvas-content, immersive-canvas, immersive-page'
  );
  if (!canvasContent) {
    return null;
  }

  let markdown = '\n\n---\n**Gemini Canvas Snapshot**\n\n';

  const titleElement = canvasContent.querySelector('h1, h2, .title, [data-test-id="title"]');
  if (titleElement?.textContent) {
    const title = titleElement.textContent.trim();
    if (title) {
      markdown += `### ${title}\n\n`;
    }
  }

  const textContent = canvasContent.querySelector(
    '[data-test-id="canvas-body"], [class*="content"], section'
  );
  if (textContent) {
    const canvasHtml = textContent.innerHTML;
    const canvasMarkdown = chatHtmlToMarkdown(canvasHtml);
    if (canvasMarkdown.trim()) {
      markdown += canvasMarkdown + '\n\n';
    }
  }

  const images = Array.from(canvasContent.querySelectorAll('img'));
  if (images.length > 0) {
    markdown += '#### Attached Images\n\n';
    images.forEach((img, index) => {
      const src =
        img.getAttribute('src') ||
        img.getAttribute('data-src') ||
        img.getAttribute('data-original-src') ||
        '';
      if (src && !src.startsWith('blob:')) {
        const alt = img.getAttribute('alt') || `Canvas Image ${index + 1}`;
        markdown += `![${alt}](${src})\n\n`;
      }
    });
  }

  markdown += '---\n';
  return markdown;
}

function extractGeminiChatData(doc: Document, config?: ParseConfig): ParsedResult {
  const deepResearchConfig = config?.deepResearch || {};
  const pureMode = deepResearchConfig.pureMode || false;

  if (pureMode) {
    const modelResponses = Array.from(doc.querySelectorAll('model-response'));
    for (const modelResponse of modelResponses) {
      const report = GeminiDeepResearchHelper.buildReportMarkdown(
        doc,
        modelResponse as HTMLElement
      );
      if (report) {
        return {
          title: 'Deep Research Report',
          messages: [
            {
              id: 'deep-research-report',
              role: 'assistant',
              md: report,
              text: report
            }
          ],
          assets: []
        };
      }
    }
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  const messageItems = Array.from(doc.querySelectorAll(GEMINI_MESSAGE_ITEM_SELECTOR));
  if (messageItems.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  const isDeepResearchSession = GeminiDeepResearchHelper.isDeepResearchSession(doc);

  let title = DEFAULT_CHAT_TITLE;

  const sidebarActiveChatItem = doc.querySelector(GEMINI_SIDEBAR_ACTIVE_CHAT_SELECTOR);
  if (sidebarActiveChatItem && sidebarActiveChatItem.textContent?.trim()) {
    title = sidebarActiveChatItem.textContent.trim();
  } else {
    title = doc.title;
  }
  if (title.startsWith(GEMINI_TITLE_REPLACE_TEXT)) {
    title = title.replace(GEMINI_TITLE_REPLACE_TEXT, '').trim();
  }

  let model = '';
  const modeSwitcher = doc.querySelector('bard-mode-switcher');
  if (modeSwitcher) {
    model = modeSwitcher.textContent?.trim() || '';
  }
  if (!model) {
    const buttons = Array.from(doc.querySelectorAll('button'));
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || '';
      if (text.match(/^(Gemini )?(2\.5|2\.0|1\.5)\s*(Pro|Flash|Advanced)/i)) {
        model = text;
        break;
      }
    }
  }

  const messages: ParsedMessage[] = [];
  let chatIndex = 1;

  const canvasContent = extractCanvasContent(doc);
  let deepResearchAppended = false;

  for (const item of messageItems) {
    let role: 'user' | 'assistant' = 'assistant';
    let messageContentElem: HTMLElement | null = null;

    const tagName = (item as HTMLElement).tagName.toLowerCase();

    if (tagName === 'user-query') {
      role = 'user';
      messageContentElem = (item as HTMLElement).querySelector(
        '[role="presentation"], [class*="query"]'
      );
      if (!messageContentElem) {
        messageContentElem = (item as HTMLElement).querySelector('rich-text, div, p');
      }
    } else {
      role = 'assistant';
      messageContentElem = (item as HTMLElement).querySelector(
        'cib-shared-markdown, message-content, response-content, rich-text, model-output, article'
      );
    }

    if (!messageContentElem) {
      messageContentElem = item as HTMLElement;
    }

    if (messageContentElem) {
      const blobImages = Array.from(messageContentElem.querySelectorAll('img[src^="blob:"]'));
      if (blobImages.length > 0) {
        console.log(`[Gemini] Found ${blobImages.length} blob URL images, converting to base64...`);
        blobImages.forEach((img, index) => {
          const imgElement = img as HTMLImageElement;
          const base64 = convertBlobImageToBase64(imgElement);
          if (base64) {
            console.log(
              `[Gemini] Converted blob image ${index + 1} to base64 (${Math.round((base64.length * 0.75) / 1024)} KB)`
            );
            imgElement.src = base64;
            if (imgElement.hasAttribute('srcset')) {
              imgElement.removeAttribute('srcset');
            }
          } else {
            console.log(`[Gemini] Failed to convert blob image ${index + 1}`);
          }
        });
      }

      const html = messageContentElem.innerHTML;
      let markdown = chatHtmlToMarkdown(html);

      const hasCanvasChip = messageContentElem.querySelector('immersive-entry-chip');
      if (hasCanvasChip && canvasContent) {
        markdown += canvasContent;
      }

      if (role === 'assistant' && !deepResearchAppended && isDeepResearchSession) {
        const deepResearchMarkdown = GeminiDeepResearchHelper.buildReportMarkdown(
          doc,
          messageContentElem
        );
        if (deepResearchMarkdown) {
          markdown += deepResearchMarkdown;
          deepResearchAppended = true;
        }
      }

      if (markdown.trim()) {
        messages.push({
          id: `msg-${chatIndex++}`,
          role,
          html,
          md: markdown,
          text: markdown
        });
      }
    }
  }

  return { title, messages, assets: [], model };
}

export const geminiParser: ChatPlatformParser = {
  id: 'gemini',
  parse: (doc, config) => extractGeminiChatData(doc, config)
};
