// AI Chat Exporter - DOM Parser
// Migrated from: https://github.com/revivalstack/chatgpt-exporter
// License: MIT

export type ParsedMessage = {
  id: string;
  role: 'user' | 'assistant' | 'system';
  html?: string;
  md?: string;
  text?: string;
  timestamp?: string; // ISO 8601 timestamp (e.g., "2025-10-02T10:30:00Z")
};

export type ParsedResult = {
  title: string;
  messages: ParsedMessage[];
  assets: Array<{ url: string; filename?: string }>;
  model?: string; // AI model name (e.g., "Gemini 2.0 Flash", "GPT-4", etc.)
  createdAt?: string; // ISO 8601 timestamp of conversation creation
};

export type DeepResearchConfig = {
  pureMode?: boolean;  // true = only capture Deep Research reports, false = include conversation
};

export type ParseConfig = {
  deepResearch?: DeepResearchConfig;
};

// Platform constants
const CHATGPT = "chatgpt";
const CLAUDE = "claude";
const COPILOT = "copilot";
const GEMINI = "gemini";
const TONGYI = "tongyi";
const DEEPSEEK = "deepseek";
const KIMI = "kimi";

// ChatGPT selectors
const CHATGPT_ARTICLE_SELECTOR = "article";
const CHATGPT_HEADER_SELECTOR = "h5";
const CHATGPT_TEXT_DIV_SELECTOR = "div.text-base";
const CHATGPT_TITLE_REPLACE_TEXT = " - ChatGPT";

// Claude selectors (updated for new UI)
const CLAUDE_MAIN_CONTAINER_SELECTOR = ".flex-1.flex.flex-col.gap-3.px-4.max-w-3xl.mx-auto.w-full.pt-1";
const CLAUDE_USER_MESSAGE_SELECTOR = '[data-testid="user-message"]';
const CLAUDE_ASSISTANT_MESSAGE_SELECTOR = ".font-claude-response";
const CLAUDE_THINKING_BLOCK_CLASS = "thinking";
const CLAUDE_ARTIFACT_BLOCK_CELL = '[data-testid="artifact-block-cell"]';

// Copilot selectors
const COPILOT_MESSAGE_SELECTOR = '[data-content="user-message"], [data-content="ai-message"]';
const COPILOT_USER_MESSAGE_SELECTOR = '[data-content="user-message"]';

// Gemini selectors
const GEMINI_MESSAGE_ITEM_SELECTOR = "user-query, model-response";
const GEMINI_SIDEBAR_ACTIVE_CHAT_SELECTOR = 'div[data-test-id="conversation"].selected .conversation-title';
const GEMINI_TITLE_REPLACE_TEXT = "Gemini - ";

// Tongyi selectors
const TONGYI_MESSAGE_CONTAINER_SELECTOR = '[class*="message-item"]';
const TONGYI_USER_MESSAGE_SELECTOR = '[class*="user-message"], [class*="userMessage"]';
const TONGYI_ASSISTANT_MESSAGE_SELECTOR = '[class*="assistant-message"], [class*="assistantMessage"], [class*="bot-message"]';
const TONGYI_TITLE_REPLACE_TEXT = " - 通义";

// DeepSeek selectors
const DEEPSEEK_MESSAGE_CONTAINER_SELECTOR = '[class*="message"], [class*="Message"]';
const DEEPSEEK_USER_MESSAGE_SELECTOR = '[class*="user"], [class*="User"]';
const DEEPSEEK_ASSISTANT_MESSAGE_SELECTOR = '[class*="assistant"], [class*="Assistant"], [class*="bot"]';
const DEEPSEEK_TITLE_REPLACE_TEXT = " - DeepSeek";

// Kimi selectors
const KIMI_MESSAGE_CONTAINER_SELECTOR = '[class*="message"], [class*="Message"]';
const KIMI_USER_MESSAGE_SELECTOR = '[class*="user"], [class*="User"]';
const KIMI_ASSISTANT_MESSAGE_SELECTOR = '[class*="assistant"], [class*="Assistant"], [class*="kimi"]';
const KIMI_TITLE_REPLACE_TEXT = " - Kimi";

const DEFAULT_CHAT_TITLE = "Conversation";

/**
 * Main entry point for parsing chat DOM
 */
export function parseChatDOM(platform: string, doc: Document, config?: ParseConfig): ParsedResult {
  switch (platform.toLowerCase()) {
    case 'chatgpt':
      return extractChatGPTChatData(doc);
    case 'claude':
      return extractClaudeChatData(doc);
    case 'copilot':
      return extractCopilotChatData(doc);
    case 'gemini':
      return extractGeminiChatData(doc, config);
    case 'tongyi':
      return extractTongyiChatData(doc);
    case 'deepseek':
      return extractDeepSeekChatData(doc);
    case 'kimi':
      return extractKimiChatData(doc);
    default:
      return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }
}

/**
 * Extract ChatGPT chat data
 */
function extractChatGPTChatData(doc: Document): ParsedResult {
  const articles = [...doc.querySelectorAll(CHATGPT_ARTICLE_SELECTOR)];
  if (articles.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  let title = doc.title.replace(CHATGPT_TITLE_REPLACE_TEXT, "").trim() || DEFAULT_CHAT_TITLE;
  const messages: ParsedMessage[] = [];
  let chatIndex = 1;

  // Extract model name from the page
  let model = '';

  // Try 1: Look for model in buttons
  const modelButtons = doc.querySelectorAll('button, [role="button"]');
  for (const btn of modelButtons) {
    const text = btn.textContent?.trim() || '';
    // Match patterns like "GPT-4", "GPT-4o", "GPT-3.5", "o1", "o1-mini", etc.
    const match = text.match(/^(GPT-[0-9.]+[a-z]*|o1(?:-mini|-preview)?|ChatGPT\s*[0-9.]*[a-z]*)$/i);
    if (match) {
      model = match[1];
      break;
    }
  }

  // Try 2: Look for model in specific elements (model selector, header, etc.)
  if (!model) {
    const selectors = [
      '[class*="model"]',
      '[class*="Model"]',
      '[data-testid*="model"]',
      '.text-token-text-secondary',
      'select option[selected]',
    ];

    for (const selector of selectors) {
      const elements = doc.querySelectorAll(selector);
      for (const el of elements) {
        const text = el.textContent?.trim() || '';
        const match = text.match(/(GPT-[0-9.]+[a-z]*|o1(?:-mini|-preview)?|ChatGPT\s*[0-9.]*[a-z]*)/i);
        if (match) {
          model = match[1];
          break;
        }
      }
      if (model) break;
    }
  }

  // Try 3: Search in page text
  if (!model) {
    const bodyText = doc.body.textContent || '';
    const modelMatch = bodyText.match(/(?:Model|模型)[:\s]*(GPT-[0-9.]+[a-z]*|o1(?:-mini|-preview)?|ChatGPT\s*[0-9.]*[a-z]*)/i);
    if (modelMatch) {
      model = modelMatch[1];
    }
  }

  // Clean up model name
  if (model) {
    model = model.trim();
  }

  for (const article of articles) {
    const header = article.querySelector(CHATGPT_HEADER_SELECTOR)?.textContent?.trim() || "";
    const html = article.innerHTML;

    // Convert HTML to markdown to preserve structure
    let markdown = chatHtmlToMarkdown(html);

    if (!markdown.trim()) continue;

    // Determine if this is a user message
    // Check multiple indicators
    const headerLower = header.toLowerCase();
    const isUser =
      headerLower.includes('you said') ||
      headerLower.includes('you') ||
      headerLower.includes('您说') ||
      headerLower.includes('您') ||
      // Also check if the article has user-specific classes or attributes
      article.classList.contains('user') ||
      article.getAttribute('data-message-author-role') === 'user' ||
      article.querySelector('[data-message-author-role="user"]') !== null;

    const role = isUser ? "user" : "assistant";

    // Remove "您说：" or "ChatGPT 说：" or "You said:" or "ChatGPT said:" from anywhere in the text
    // Use global flag to remove all occurrences
    markdown = markdown
      .replace(/^您说[：:]\s*/gm, '')
      .replace(/^ChatGPT\s*说[：:]\s*/gm, '')
      .replace(/^You\s+said[：:]\s*/gmi, '')
      .replace(/^ChatGPT\s+said[：:]\s*/gmi, '')
      .replace(/您说[：:]\s*/g, '')
      .replace(/ChatGPT\s*说[：:]\s*/g, '')
      .replace(/You\s+said[：:]\s*/gi, '')
      .replace(/ChatGPT\s+said[：:]\s*/gi, '')
      .trim();

    messages.push({
      id: `msg-${chatIndex++}`,
      role,
      html: html,
      md: markdown,
      text: markdown // fallback
    });
  }

  return { title, messages, assets: [], model: model || undefined };
}

/**
 * Extract Claude chat data (updated for new UI)
 */
function extractClaudeChatData(doc: Document): ParsedResult {
  // Find the main container with all messages
  const mainContainer = doc.querySelector(CLAUDE_MAIN_CONTAINER_SELECTOR);
  if (!mainContainer) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  const messages: ParsedMessage[] = [];
  let chatIndex = 1;

  // Extract title from document title (e.g., "Develop algorithm solutions - Claude")
  let title = doc.title.replace(/ - Claude$/, "").trim() || DEFAULT_CHAT_TITLE;

  // Extract model name from button text (e.g., "Sonnet 4.5")
  let model = '';
  const buttons = doc.querySelectorAll('button');
  for (const btn of buttons) {
    const text = btn.textContent?.trim() || '';
    if (text.match(/^(Sonnet|Opus|Haiku)\s+[\d.]+$/i)) {
      model = 'Claude ' + text;
      break;
    }
  }

  // Iterate through all children of the main container
  Array.from(mainContainer.children).forEach((child) => {
    const element = child as HTMLElement;

    // Check if this is a user message
    const userMessage = element.querySelector(CLAUDE_USER_MESSAGE_SELECTOR);
    if (userMessage) {
      const html = userMessage.innerHTML;
      const markdown = chatHtmlToMarkdown(html);

      if (markdown.trim()) {
        messages.push({
          id: `msg-${chatIndex++}`,
          role: "user",
          html: html,
          md: markdown,
          text: markdown
        });
      }
      return;
    }

    // Check if this is an assistant message
    const assistantMessage = element.querySelector(CLAUDE_ASSISTANT_MESSAGE_SELECTOR);
    if (assistantMessage) {
      // Find the markdown content container
      const markdownContainer = assistantMessage.querySelector('.standard-markdown, .progressive-markdown');
      if (markdownContainer) {
        const html = markdownContainer.innerHTML;
        const markdown = chatHtmlToMarkdown(html);

        if (markdown.trim()) {
          messages.push({
            id: `msg-${chatIndex++}`,
            role: "assistant",
            html: html,
            md: markdown,
            text: markdown
          });
        }
      }
      return;
    }
  });

  return { title, messages, assets: [], model };
}

/**
 * Extract Copilot chat data
 */
function extractCopilotChatData(doc: Document): ParsedResult {
  const messageItems = [...doc.querySelectorAll(COPILOT_MESSAGE_SELECTOR)];
  if (messageItems.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  const messages: ParsedMessage[] = [];
  let chatIndex = 1;

  // Extract title from selected conversation or document title
  let rawTitle = "";
  const selected = doc.querySelector('[role="option"][aria-selected="true"]');
  if (selected) {
    rawTitle = selected.querySelector("p")?.textContent?.trim() ||
      (selected.getAttribute("aria-label") || "")
        .split(",")
        .slice(1)
        .join(",")
        .trim();
  }
  if (!rawTitle) {
    rawTitle = (doc.title || "")
      .replace(/^\s*Microsoft[_\s-]*Copilot.*$/i, "")
      .replace(/\s*[-–|]\s*Copilot.*$/i, "")
      .trim();
  }
  if (!rawTitle) rawTitle = "Copilot Conversation";

  for (const item of messageItems) {
    const isUser = (item as HTMLElement).matches(COPILOT_USER_MESSAGE_SELECTOR);
    const role = isUser ? "user" : "assistant";

    const html = (item as HTMLElement).innerHTML;
    // Don't use innerText directly as it loses structure
    // Let chatHtmlToMarkdown handle the conversion to preserve formatting
    const markdown = chatHtmlToMarkdown(html);

    if (markdown.trim()) {
      messages.push({
        id: `msg-${chatIndex++}`,
        role,
        html: html,
        md: markdown,
        text: markdown // fallback
      });
    }
  }

  return { title: rawTitle, messages, assets: [] };
}

/**
 * Extract Canvas content from Gemini
 * Canvas content is in a separate immersive-panel, not directly in model-response
 */
function extractCanvasContent(doc: Document): string | null {
  // Canvas content is in: immersive-panel > extended-response-panel > immersive-editor > .ProseMirror
  const immersivePanel = doc.querySelector('immersive-panel');
  if (!immersivePanel) return null;

  const extendedPanel = immersivePanel.querySelector('extended-response-panel');
  if (!extendedPanel) return null;

  const immersiveEditor = extendedPanel.querySelector('immersive-editor');
  if (!immersiveEditor) return null;

  // Get the ProseMirror contenteditable div which contains the actual Canvas content
  const proseMirror = immersiveEditor.querySelector('.ProseMirror[contenteditable="true"]');
  if (!proseMirror) return null;

  // Get the Canvas title from the toolbar
  let canvasTitle = '';
  const titleElem = extendedPanel.querySelector('h2.title-text, [class*="title-text"]');
  if (titleElem) {
    canvasTitle = titleElem.textContent?.trim() || '';
  }

  // Convert the Canvas content to markdown
  const canvasHtml = proseMirror.innerHTML;
  const canvasMarkdown = chatHtmlToMarkdown(canvasHtml);

  if (canvasMarkdown.trim()) {
    let result = '\n\n---\n**[Canvas Content]**\n\n';
    if (canvasTitle) {
      result += `# ${canvasTitle}\n\n`;
    }
    result += canvasMarkdown + '\n\n---\n';
    return result;
  }

  return null;
}

/**
 * Normalize paragraph spacing in Deep Research content
 * Fixes issues where paragraphs have inconsistent spacing (too many or too few blank lines)
 */
function normalizeDeepResearchSpacing(markdown: string): string {
  // Step 1: Normalize multiple consecutive blank lines to exactly 2 newlines (1 blank line)
  // This handles cases where there are 3+ newlines in a row
  markdown = markdown.replace(/\n{3,}/g, '\n\n');

  // Step 2: Fix spacing around headings
  // Ensure headings have exactly one blank line before and after
  // Pattern: heading followed by too many newlines
  markdown = markdown.replace(/(^|\n)(#{1,6}\s+.+?)\n{3,}/g, '$1$2\n\n');

  // Pattern: too many newlines before heading
  markdown = markdown.replace(/\n{3,}(#{1,6}\s+.+?)(\n|$)/g, '\n\n$1$2');

  // Step 3: Fix spacing between regular paragraphs
  // Ensure there's exactly one blank line between paragraphs
  // A paragraph is defined as a line with text that's not a heading, list, or code block
  const lines = markdown.split('\n');
  const result: string[] = [];
  let prevLineWasContent = false;
  let blankLineCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmedLine = line.trim();

    // Check if this is a blank line
    if (trimmedLine === '') {
      blankLineCount++;
      continue;
    }

    // This is a content line
    const isHeading = /^#{1,6}\s/.test(trimmedLine);
    const isListItem = /^[\-\*\+]\s/.test(trimmedLine) || /^\d+\.\s/.test(trimmedLine);
    const isCodeFence = /^```/.test(trimmedLine);
    const isBlockquote = /^>/.test(trimmedLine);
    const isHorizontalRule = /^[\-\*_]{3,}$/.test(trimmedLine);
    const isTableRow = /^\|/.test(trimmedLine);

    // Determine how many blank lines we need before this line
    let neededBlankLines = 0;

    if (prevLineWasContent) {
      if (isHeading || isCodeFence || isHorizontalRule) {
        // Headings, code blocks, and horizontal rules need one blank line before
        neededBlankLines = 1;
      } else if (isListItem || isBlockquote || isTableRow) {
        // Lists, blockquotes, and tables need one blank line before (if not already in one)
        neededBlankLines = 1;
      } else {
        // Regular paragraph text needs one blank line before
        neededBlankLines = 1;
      }
    }

    // Add the appropriate number of blank lines
    for (let j = 0; j < neededBlankLines; j++) {
      result.push('');
    }

    // Add the content line
    result.push(line);
    prevLineWasContent = true;
    blankLineCount = 0;
  }

  // Join the lines back together
  let normalized = result.join('\n');

  // Step 4: Clean up any remaining issues
  // Remove blank lines at the very beginning
  normalized = normalized.replace(/^\n+/, '');

  // Ensure the content ends with exactly one newline
  normalized = normalized.replace(/\n*$/, '\n');

  // Step 5: Fix specific patterns that might still be problematic
  // Fix: heading followed immediately by another heading (should have blank line)
  normalized = normalized.replace(/(#{1,6}\s+.+?)\n(#{1,6}\s+)/g, '$1\n\n$2');

  // Fix: paragraph text running into next paragraph without blank line
  // This catches cases where a line of text is immediately followed by another line of text
  // (not a heading, list, etc.)
  normalized = normalized.replace(/([^\n])\n([^\n#\-\*\+\d>`|])/g, (match, p1, p2) => {
    // Check if p2 starts a new sentence (capital letter or Chinese character)
    if (/^[A-Z\u4e00-\u9fa5]/.test(p2)) {
      return p1 + '\n\n' + p2;
    }
    return match;
  });

  return normalized;
}

/**
 * Extract all Deep Research reports from the document
 * @param doc - The document to extract from
 * @returns Array of Deep Research report markdown strings
 */
function extractAllDeepResearchReports(doc: Document): string[] {
  const reports: string[] = [];

  // Find all model-response elements that contain deep-research-confirmation-widget
  const allModelResponses = doc.querySelectorAll('model-response');

  for (const modelResponse of allModelResponses) {
    const deepResearchWidget = modelResponse.querySelector('deep-research-confirmation-widget');
    if (deepResearchWidget) {
      const report = extractDeepResearchContent(doc, modelResponse as HTMLElement);
      if (report) {
        reports.push(report);
      }
    }
  }

  return reports;
}

/**
 * Extract Deep Research report content from Gemini
 * Deep Research has two parts:
 * 1. Confirmation widget in model-response (the plan)
 * 2. Full report in deep-research-immersive-panel (the actual report)
 */
function extractDeepResearchContent(doc: Document, messageElem: HTMLElement): string | null {
  // Check if this message has Deep Research components
  const deepResearchWidget = messageElem.querySelector('deep-research-confirmation-widget');

  if (!deepResearchWidget) return null;

  let reportMarkdown = '\n\n---\n**[Deep Research Report]**\n\n';

  // Extract title from the confirmation widget
  const titleElem = messageElem.querySelector('[data-test-id="title"]');
  if (titleElem) {
    const titleText = titleElem.textContent?.trim();
    if (titleText) {
      reportMarkdown += `# ${titleText}\n\n`;
    }
  }

  // Extract research steps (the plan) from the confirmation widget
  const researchSteps = messageElem.querySelectorAll('.research-step');
  if (researchSteps.length > 0) {
    reportMarkdown += '## Research Plan\n\n';
    researchSteps.forEach((step, index) => {
      const stepTitle = step.querySelector('.research-step-title')?.textContent?.trim();
      const stepDesc = step.querySelector('.research-step-description')?.textContent?.trim();

      if (stepTitle) {
        reportMarkdown += `### ${index + 1}. ${stepTitle}\n\n`;
      }
      if (stepDesc) {
        reportMarkdown += `${stepDesc}\n\n`;
      }
    });
  }

  // Note: Gemini's Deep Research does not include a complete references list in the DOM
  // The references are only accessible by clicking on citation numbers in the UI
  // We'll keep the citation numbers [1], [2], etc. but without URLs

  // Extract the full report content from deep-research-immersive-panel
  // This is in a separate panel, similar to Canvas
  const deepResearchPanel = doc.querySelector('deep-research-immersive-panel');

  // Collect all unique citation numbers from the report
  const citationNumbers = new Set<string>();

  if (deepResearchPanel) {
    // The actual report content is in message-content within the panel
    const reportContent = deepResearchPanel.querySelector('message-content');
    if (reportContent) {
      // IMPORTANT: Don't clone or use innerHTML - it loses .katex-html content!
      // Instead, directly convert the original DOM to markdown using nodeToMarkdown
      // which can handle the live DOM elements properly

      // Collect citation numbers before converting
      const allFootnotes = reportContent.querySelectorAll('source-footnote');
      allFootnotes.forEach((footnote) => {
        const sup = footnote.querySelector('sup');
        if (sup) {
          const sourceIndex = sup.getAttribute('data-turn-source-index');
          if (sourceIndex) {
            citationNumbers.add(sourceIndex);
          }
        }
      });

      // Convert the report content directly from the live DOM
      let contentMarkdown = '';
      for (const child of Array.from(reportContent.childNodes)) {
        contentMarkdown += nodeToMarkdown(child, '');
      }

      // Normalize paragraph spacing in Deep Research content
      // This fixes issues where paragraphs have inconsistent spacing
      contentMarkdown = normalizeDeepResearchSpacing(contentMarkdown);

      // Only add if it's substantial content (more than just the plan)
      if (contentMarkdown.trim().length > 500) {
        reportMarkdown += '## Full Report\n\n' + contentMarkdown + '\n\n';
      }
    }
  }

  // Add a note about citations if any were found
  if (citationNumbers.size > 0) {
    const sortedCitations = Array.from(citationNumbers).sort((a, b) => Number(a) - Number(b));
    reportMarkdown += '\n---\n\n';
    reportMarkdown += '## 📚 Citations\n\n';
    reportMarkdown += `This report references **${sortedCitations.length} sources**: ${sortedCitations.map(n => `[${n}]`).join(', ')}\n\n`;
    reportMarkdown += '> **Note**: Citation URLs are not available in the exported version. To view the full source details:\n';
    reportMarkdown += '> 1. Visit the [original Deep Research page in Gemini](https://gemini.google.com)\n';
    reportMarkdown += '> 2. Click on the citation numbers in the report\n';
    reportMarkdown += '> 3. Copy the URLs and add them to this document if needed\n\n';
  }

  reportMarkdown += '---\n';

  return reportMarkdown;
}

/**
 * Extract Gemini chat data
 */
function extractGeminiChatData(doc: Document, config?: ParseConfig): ParsedResult {
  const deepResearchConfig = config?.deepResearch || {};
  const pureMode = deepResearchConfig.pureMode || false;

  // If pureMode is enabled, only extract Deep Research report (the currently opened one)
  if (pureMode) {
    // Find the currently opened Deep Research report
    const deepResearchPanel = doc.querySelector('deep-research-immersive-panel');
    if (deepResearchPanel) {
      // Find the model-response that contains the Deep Research widget
      const modelResponses = doc.querySelectorAll('model-response');
      for (const modelResponse of modelResponses) {
        const widget = modelResponse.querySelector('deep-research-confirmation-widget');
        if (widget) {
          const report = extractDeepResearchContent(doc, modelResponse as HTMLElement);
          if (report) {
            return {
              title: 'Deep Research Report',
              messages: [{
                id: 'deep-research-report',
                role: 'assistant',
                md: report,
                text: report
              }],
              assets: []
            };
          }
        }
      }
    }
    // If no report found, return empty
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  const messageItems = [...doc.querySelectorAll(GEMINI_MESSAGE_ITEM_SELECTOR)];
  if (messageItems.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  let title = DEFAULT_CHAT_TITLE;

  // Prioritize title from sidebar if available and not generic
  const sidebarActiveChatItem = doc.querySelector(GEMINI_SIDEBAR_ACTIVE_CHAT_SELECTOR);
  if (sidebarActiveChatItem && sidebarActiveChatItem.textContent?.trim()) {
    title = sidebarActiveChatItem.textContent.trim();
  } else {
    title = doc.title;
  }
  if (title.startsWith(GEMINI_TITLE_REPLACE_TEXT)) {
    title = title.replace(GEMINI_TITLE_REPLACE_TEXT, "").trim();
  }

  // Extract model name from bard-mode-switcher or buttons
  let model = '';
  const modeSwitcher = doc.querySelector('bard-mode-switcher');
  if (modeSwitcher) {
    model = modeSwitcher.textContent?.trim() || '';
  }
  // Fallback: look for buttons with model names
  if (!model) {
    const buttons = doc.querySelectorAll('button');
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

  // Debug: Log all images found in the document (including Shadow DOM)
  const allImages = doc.querySelectorAll('img');
  console.log(`[Gemini] Found ${allImages.length} img elements in light DOM`);
  allImages.forEach((img, index) => {
    const src = img.getAttribute('src') || '';
    const dataSrc = img.getAttribute('data-src') || '';
    const alt = img.getAttribute('alt') || '';
    const isBlobUrl = src.startsWith('blob:');
    console.log(`[Gemini] Image ${index + 1}: src="${src.substring(0, 100)}" ${isBlobUrl ? '(BLOB URL - will be skipped)' : ''}, data-src="${dataSrc.substring(0, 100)}", alt="${alt}"`);
  });

  // Debug: Check for Shadow DOM images
  let shadowImageCount = 0;
  const allElements = doc.querySelectorAll('*');
  allElements.forEach(elem => {
    if (elem.shadowRoot) {
      const shadowImages = elem.shadowRoot.querySelectorAll('img');
      if (shadowImages.length > 0) {
        console.log(`[Gemini] Found ${shadowImages.length} images in Shadow DOM of <${elem.tagName.toLowerCase()}>`);
        shadowImages.forEach((img, index) => {
          const src = img.getAttribute('src') || '';
          console.log(`[Gemini] Shadow Image ${index + 1}: src="${src.substring(0, 100)}"`);
          shadowImageCount++;
        });
      }
    }
  });
  if (shadowImageCount > 0) {
    console.log(`[Gemini] Total images in Shadow DOM: ${shadowImageCount}`);
    console.log(`[Gemini] Note: Shadow DOM images may not be captured by the current implementation`);
  }

  // Debug: Log custom image elements
  const customImageElements = doc.querySelectorAll('image-query, uploaded-image, [class*="image-container"], [class*="uploaded-image"]');
  console.log(`[Gemini] Found ${customImageElements.length} custom image elements`);
  customImageElements.forEach((elem, index) => {
    console.log(`[Gemini] Custom image ${index + 1}: tagName="${elem.tagName}", classes="${elem.className}"`);
    // Check if it has shadowRoot
    if (elem.shadowRoot) {
      console.log(`[Gemini]   -> Has Shadow DOM`);
    }
  });

  // Extract Canvas content once (it's in a separate panel, not in model-response)
  const canvasContent = extractCanvasContent(doc);

  for (const item of messageItems) {
    let role: 'user' | 'assistant' = 'assistant';
    let messageContentElem: HTMLElement | null = null;

    const tagName = (item as HTMLElement).tagName.toLowerCase();

    if (tagName === "user-query") {
      role = "user";
      messageContentElem = item as HTMLElement;
    } else if (tagName === "model-response") {
      role = "assistant";
      messageContentElem = item as HTMLElement;
    }

    if (messageContentElem) {
      // IMPORTANT: Convert blob URLs to base64 BEFORE getting innerHTML
      // This is because blob URLs may become invalid after serialization
      const blobImages = messageContentElem.querySelectorAll('img[src^="blob:"]');
      if (blobImages.length > 0) {
        console.log(`[Gemini] Found ${blobImages.length} blob URL images, converting to base64...`);
        blobImages.forEach((img, index) => {
          const imgElement = img as HTMLImageElement;
          const base64 = convertBlobImageToBase64(imgElement);
          if (base64) {
            console.log(`[Gemini] Converted blob image ${index + 1} to base64 (${Math.round(base64.length * 0.75 / 1024)} KB)`);
            imgElement.src = base64;
            // Also update srcset if present
            if (imgElement.hasAttribute('srcset')) {
              imgElement.removeAttribute('srcset');
            }
          } else {
            console.log(`[Gemini] Failed to convert blob image ${index + 1}`);
          }
        });
      }

      const html = messageContentElem.innerHTML;
      // Convert HTML to markdown to preserve structure
      let markdown = chatHtmlToMarkdown(html);

      // Check if this message has an immersive-entry-chip (Canvas entry point)
      // If so, append the Canvas content to this message
      const hasCanvasChip = messageContentElem.querySelector('immersive-entry-chip');
      if (hasCanvasChip && canvasContent) {
        markdown += canvasContent;
      }

      // Check for Deep Research content (always capture the currently opened report)
      const deepResearchContent = extractDeepResearchContent(doc, messageContentElem);
      if (deepResearchContent) {
        markdown += deepResearchContent;
      }

      if (markdown.trim()) {
        messages.push({
          id: `msg-${chatIndex++}`,
          role,
          html: html,
          md: markdown,
          text: markdown // fallback
        });
      }
    }
  }

  return { title, messages, assets: [], model };
}

/**
 * Extract Tongyi chat data
 */
function extractTongyiChatData(doc: Document): ParsedResult {
  // Tongyi uses specific class names for questions and answers
  const questionItems = doc.querySelectorAll('[class*="questionItem"]');
  const answerItems = doc.querySelectorAll('[class*="answerItem"]');

  console.log(`[Tongyi] Found ${questionItems.length} questions and ${answerItems.length} answers`);

  if (questionItems.length === 0 && answerItems.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  // Extract title from document title
  let title = doc.title.replace(TONGYI_TITLE_REPLACE_TEXT, "").replace(" - 你的超级个人助理", "").replace(" - 通义千问", "").trim();

  if (!title || title === "通义") {
    // Try to get title from the first question
    if (questionItems.length > 0) {
      const firstQuestion = questionItems[0].textContent?.trim() || '';
      title = firstQuestion.substring(0, 50) + (firstQuestion.length > 50 ? '...' : '');
    } else {
      title = "通义千问对话";
    }
  }

  // Extract model name from page
  let model = '';

  // Try 1: Check localStorage for selected model
  try {
    const selectedModel = localStorage.getItem('selectedQwenModel');
    if (selectedModel) {
      // Convert "tongyi-qwen3-plus-model" to "Qwen3-Plus"
      const match = selectedModel.match(/qwen(\d+)[\s-]*(max|plus|turbo|pro)?/i);
      if (match) {
        const version = match[1]; // "3"
        const variant = match[2] ? match[2].charAt(0).toUpperCase() + match[2].slice(1).toLowerCase() : '';
        model = `Qwen${version}${variant ? '-' + variant : ''}`;
      }
    }
  } catch (e) {
    // localStorage might not be accessible
  }

  // Try 2: Search in page text for "Qwen" followed by numbers
  if (!model) {
    const bodyText = doc.body.textContent || '';
    const qwenMatch = bodyText.match(/Qwen[\s-]?(\d+)[\s-]*(max|plus|turbo|pro)?/i);
    if (qwenMatch) {
      const version = qwenMatch[1];
      const variant = qwenMatch[2] ? qwenMatch[2].charAt(0).toUpperCase() + qwenMatch[2].slice(1).toLowerCase() : '';
      model = `Qwen${version}${variant ? '-' + variant : ''}`;
    }
  }

  // Try 3: Look in buttons
  if (!model) {
    const buttons = doc.querySelectorAll('button, [role="button"]');
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || '';
      if (text.match(/^(通义千问|Qwen|qwen)[\s-]*(\d+)?[\s-]*(max|plus|turbo)?$/i)) {
        model = text;
        break;
      }
    }
  }

  // Try 4: Look for model in specific elements
  if (!model) {
    const modelElements = doc.querySelectorAll('[class*="model"], [class*="Model"]');
    for (const el of modelElements) {
      const text = el.textContent?.trim() || '';
      if (text.match(/(通义千问|Qwen|qwen)[\s-]*(\d+)?[\s-]*(max|plus|turbo)?/i)) {
        model = text;
        break;
      }
    }
  }

  // Fallback: Use default model name
  if (!model) {
    model = '通义千问';
  }

  const messages: ParsedMessage[] = [];

  // Combine questions and answers into a single array with their positions
  const allMessages: Array<{element: Element, role: 'user' | 'assistant', index: number}> = [];

  // Add all questions
  questionItems.forEach((item, index) => {
    allMessages.push({
      element: item,
      role: 'user',
      index: index * 2  // Even indices for questions
    });
  });

  // Add all answers
  answerItems.forEach((item, index) => {
    allMessages.push({
      element: item,
      role: 'assistant',
      index: index * 2 + 1  // Odd indices for answers
    });
  });

  // Sort by index to maintain conversation order
  allMessages.sort((a, b) => a.index - b.index);

  console.log(`[Tongyi] Processing ${allMessages.length} messages`);

  // Process each message
  let chatIndex = 1;
  for (const {element, role} of allMessages) {
    const html = element.innerHTML;
    let markdown = chatHtmlToMarkdown(html);

    // Clean up Tongyi-specific artifacts
    // 1. Remove "ASSISTANT" text that appears at the start of assistant messages
    if (role === 'assistant') {
      markdown = markdown.replace(/^ASSISTANT\s*/i, '').trim();
    }

    // 2. Remove Tongyi icon images (they appear at the start of assistant messages)
    // Pattern: ![](https://img.alicdn.com/imgextra/...)
    markdown = markdown.replace(/!\[\]\(https:\/\/img\.alicdn\.com\/imgextra\/[^)]+\)\s*/g, '').trim();

    const text = element.textContent?.trim() || '';

    if (text && markdown) {
      messages.push({
        id: `msg-${chatIndex++}`,
        role,
        html: html,
        md: markdown,
        text: markdown
      });

      console.log(`[Tongyi] Added ${role} message: ${text.substring(0, 50)}...`);
    }
  }

  console.log(`[Tongyi] Total messages extracted: ${messages.length}`);

  // Don't set createdAt since Tongyi doesn't display timestamps
  // (no point in using current time as it would be same as clipped_at)

  return { title, messages, assets: [], model };
}

/**
 * Extract DeepSeek chat data
 */
function extractDeepSeekChatData(doc: Document): ParsedResult {
  // DeepSeek uses "ds-message" class for messages
  const messageItems = doc.querySelectorAll('.ds-message, [class*="ds-message"]');

  console.log(`[DeepSeek] Found ${messageItems.length} messages`);

  if (messageItems.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  const messages: ParsedMessage[] = [];

  // Extract title from document title
  let title = doc.title
    .replace(DEEPSEEK_TITLE_REPLACE_TEXT, "")
    .replace(" - DeepSeek Chat", "")
    .replace("DeepSeek - ", "")
    .trim() || DEFAULT_CHAT_TITLE;

  // Extract model name
  let model = '';

  // Try 1: Check localStorage
  try {
    const keys = Object.keys(localStorage);
    for (const key of keys) {
      if (key.includes('model') || key.includes('deepseek')) {
        const value = localStorage.getItem(key);
        if (value) {
          // Try to extract model name from JSON or string
          const modelMatch = value.match(/deepseek[\s-]*(chat|coder|v[0-9]+|r1)?/i);
          if (modelMatch) {
            model = 'DeepSeek-' + (modelMatch[1] || 'Chat');
            break;
          }
        }
      }
    }
  } catch (e) {
    // localStorage might not be accessible
  }

  // Try 2: Search in page text
  if (!model) {
    const bodyText = doc.body.textContent || '';
    const deepseekMatch = bodyText.match(/DeepSeek[\s-]*(Chat|Coder|V[0-9]+|R1)?/i);
    if (deepseekMatch) {
      model = deepseekMatch[0];
    }
  }

  // Try 3: Look in buttons
  if (!model) {
    const buttons = doc.querySelectorAll('button, [role="button"]');
    for (const btn of buttons) {
      const text = btn.textContent?.trim() || '';
      if (text.match(/^(DeepSeek|deepseek)[\s-]*(chat|coder|v[0-9]+|r1)?$/i)) {
        model = text;
        break;
      }
    }
  }

  // Fallback: Use default model name
  if (!model) {
    model = 'DeepSeek';
  }

  // Process messages - DeepSeek alternates user/assistant
  let chatIndex = 1;
  messageItems.forEach((item, index) => {
    const element = item as HTMLElement;

    // DeepSeek messages alternate: user (even index), assistant (odd index)
    const role: 'user' | 'assistant' = index % 2 === 0 ? 'user' : 'assistant';

    const html = element.innerHTML;
    let markdown = chatHtmlToMarkdown(html);

    // Clean up DeepSeek-specific artifacts
    if (role === 'assistant') {
      // Remove any "DeepSeek" or "ASSISTANT" prefix
      markdown = markdown.replace(/^(DeepSeek|ASSISTANT)\s*/i, '').trim();
    }

    const text = element.textContent?.trim() || '';

    if (text && markdown) {
      messages.push({
        id: `msg-${chatIndex++}`,
        role,
        html: html,
        md: markdown,
        text: markdown
      });

      console.log(`[DeepSeek] Added ${role} message: ${text.substring(0, 50)}...`);
    }
  });

  console.log(`[DeepSeek] Total messages extracted: ${messages.length}`);

  // Don't set createdAt since DeepSeek doesn't display timestamps
  // (no point in using current time as it would be same as clipped_at)

  return { title, messages, assets: [], model };
}

/**
 * Extract Kimi chat data
 */
function extractKimiChatData(doc: Document): ParsedResult {
  // Try to find message containers using various possible selectors
  let messageItems: Element[] = [];

  // Try different selector patterns that Kimi might use
  const possibleSelectors = [
    '[class*="message-item"]',
    '[class*="messageItem"]',
    '[class*="chat-message"]',
    '[class*="chatMessage"]',
    '[class*="Message"]',
    '[data-role="user"], [data-role="assistant"]',
    '[data-type="user"], [data-type="assistant"]',
    'article',
  ];

  for (const selector of possibleSelectors) {
    messageItems = [...doc.querySelectorAll(selector)];
    if (messageItems.length > 0) break;
  }

  if (messageItems.length === 0) {
    return { title: DEFAULT_CHAT_TITLE, messages: [], assets: [] };
  }

  const messages: ParsedMessage[] = [];
  let chatIndex = 1;

  // Extract title from document title
  let title = doc.title
    .replace(KIMI_TITLE_REPLACE_TEXT, "")
    .replace(" - Kimi Chat", "")
    .replace("Kimi - ", "")
    .trim() || DEFAULT_CHAT_TITLE;

  // Extract model name from page
  let model = '';
  const buttons = doc.querySelectorAll('button, [role="button"]');
  for (const btn of buttons) {
    const text = btn.textContent?.trim() || '';
    // Match patterns like "Kimi", "moonshot", "kimi-k2", etc.
    if (text.match(/^(Kimi|moonshot|kimi)[\s-]*(k2|k1|plus)?$/i)) {
      model = text;
      break;
    }
  }

  // Fallback: look for model in specific elements
  if (!model) {
    const modelElements = doc.querySelectorAll('[class*="model"], [class*="Model"]');
    for (const el of modelElements) {
      const text = el.textContent?.trim() || '';
      if (text.match(/(Kimi|moonshot|kimi)[\s-]*(k2|k1|plus)?/i)) {
        model = text;
        break;
      }
    }
  }

  for (const item of messageItems) {
    const element = item as HTMLElement;

    // Determine if this is a user or assistant message
    let role: 'user' | 'assistant' = 'assistant';

    // Check various attributes and classes to determine role
    const dataRole = element.getAttribute('data-role');
    const dataType = element.getAttribute('data-type');
    const className = element.className || '';

    if (dataRole === 'user' || dataType === 'user' ||
        className.includes('user') || className.includes('User')) {
      role = 'user';
    } else if (dataRole === 'assistant' || dataType === 'assistant' ||
               className.includes('assistant') || className.includes('Assistant') ||
               className.includes('kimi') || className.includes('Kimi')) {
      role = 'assistant';
    } else {
      // Try to find child elements that indicate role
      const userIndicator = element.querySelector(KIMI_USER_MESSAGE_SELECTOR);
      const assistantIndicator = element.querySelector(KIMI_ASSISTANT_MESSAGE_SELECTOR);

      if (userIndicator) {
        role = 'user';
      } else if (assistantIndicator) {
        role = 'assistant';
      }
    }

    const html = element.innerHTML;
    const markdown = chatHtmlToMarkdown(html);

    if (markdown.trim()) {
      messages.push({
        id: `msg-${chatIndex++}`,
        role,
        html: html,
        md: markdown,
        text: markdown
      });
    }
  }

  return { title, messages, assets: [], model };
}

/**
 * Global variable to store heading level offset for the current message block
 * This is used to adjust heading levels so the highest heading in a message becomes h2
 */
let headingLevelOffset = 0;

/**
 * Convert a Blob URL image to Base64 data URI (synchronous)
 * This is needed for Gemini's user-uploaded images which only have blob URLs
 * Note: This must be called synchronously during DOM traversal
 */
function convertBlobImageToBase64(imgElement: HTMLImageElement): string | null {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Set canvas size to match image
    canvas.width = imgElement.naturalWidth || imgElement.width;
    canvas.height = imgElement.naturalHeight || imgElement.height;

    // Check if image has valid dimensions
    if (canvas.width === 0 || canvas.height === 0) {
      console.log('[Image] Image has no dimensions, skipping blob conversion');
      return null;
    }

    // Draw image to canvas
    ctx.drawImage(imgElement, 0, 0);

    // Convert to base64 (JPEG with 80% quality to reduce size)
    const base64 = canvas.toDataURL('image/jpeg', 0.8);

    const sizeKB = Math.round(base64.length * 0.75 / 1024);
    console.log(`[Image] Converted blob URL to base64 (${sizeKB} KB)`);
    return base64;
  } catch (e) {
    console.error('[Image] Failed to convert blob URL to base64:', e);
    return null;
  }
}

/**
 * Recursively convert a DOM node to Markdown
 * This handles nested structures properly
 */
function nodeToMarkdown(node: Node, indent: string = ''): string {
  // Text node
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent || '';
  }

  // Element node
  if (node.nodeType === Node.ELEMENT_NODE) {
    const elem = node as HTMLElement;
    const tagName = elem.tagName.toLowerCase();

    // Handle Gemini Deep Research source-footnote elements
    // Note: Gemini doesn't provide URLs in the DOM, so we just keep the citation numbers
    if (tagName === 'source-footnote') {
      const sup = elem.querySelector('sup');
      if (sup) {
        let number = sup.textContent?.trim();
        if (!number) {
          const sourceIndex = sup.getAttribute('data-turn-source-index');
          if (sourceIndex) {
            number = sourceIndex;
          }
        }
        if (number) {
          return `[${number}]`;
        }
      }
      return '';
    }

    // Handle KaTeX math expressions (used in Gemini for scientific notation, formulas, etc.)
    // KaTeX renders math in a complex DOM structure, we need to reconstruct the text properly
    if (elem.classList.contains('katex') || elem.classList.contains('math-inline')) {
      // Try to get the annotation (original LaTeX/text) - some platforms include this
      const annotation = elem.querySelector('annotation[encoding="application/x-tex"]');
      if (annotation && annotation.textContent) {
        // Return the LaTeX wrapped in $ for inline math
        return `$${annotation.textContent}$`;
      }

      // Fallback: try to get readable text from katex-mathml
      const mathml = elem.querySelector('math');
      if (mathml && mathml.textContent) {
        return mathml.textContent.trim();
      }

      // For Gemini's KaTeX: manually reconstruct the text with proper superscripts
      // Gemini uses .msupsub for superscripts (e.g., 10³ in scientific notation)
      const katexHtml = elem.querySelector('.katex-html');
      if (katexHtml) {
        let result = '';
        const bases = katexHtml.querySelectorAll('.base');

        bases.forEach((base) => {
          // Process each child of the base
          for (const child of Array.from(base.children)) {
            const childElem = child as HTMLElement;
            const className = childElem.className || '';

            // Skip strut elements (layout helpers)
            if (className.includes('strut')) continue;

            // Handle regular content (.mord, .mbin, etc.)
            if (className.includes('mord') || className.includes('mbin')) {
              // Check if this element has a superscript/subscript
              const msupsub = childElem.querySelector('.msupsub');
              if (msupsub) {
                // Get the base text (without the superscript)
                const baseText = Array.from(childElem.childNodes)
                  .filter(n => n.nodeType === Node.TEXT_NODE ||
                              (n.nodeType === Node.ELEMENT_NODE &&
                               !(n as HTMLElement).classList.contains('msupsub')))
                  .map(n => n.textContent)
                  .join('');

                // Get the superscript text
                const mtight = msupsub.querySelector('.mtight');
                const supText = mtight?.textContent || '';

                // Convert to Unicode superscript if possible
                const superscriptMap: Record<string, string> = {
                  '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
                  '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
                  '-': '⁻', '+': '⁺'
                };

                const unicodeSup = supText.split('').map(c => superscriptMap[c] || c).join('');
                result += baseText + unicodeSup;
              } else {
                // No superscript, just add the text
                result += childElem.textContent || '';
              }
            } else if (className.includes('mspace')) {
              // Add space
              result += ' ';
            }
          }
        });

        return result.trim();
      }

      // Last resort: get all text content (may not have proper superscripts)
      const text = elem.textContent?.trim();
      if (text) {
        return text;
      }
    }

    // Code blocks (but check for tables first - Claude wraps tables in <pre>)
    if (tagName === 'pre') {
      // Check if this <pre> contains a table
      const table = elem.querySelector('table');
      if (table) {
        // Process the table instead of treating it as code
        return nodeToMarkdown(table, indent);
      }

      const code = elem.querySelector('code');
      if (code) {
        const cleanCode = code.textContent || '';
        return '\n```\n' + cleanCode + '\n```\n';
      }
      return '\n```\n' + (elem.textContent || '') + '\n```\n';
    }

    // Inline code
    if (tagName === 'code') {
      return '`' + (elem.textContent || '') + '`';
    }

    // Bold
    if (tagName === 'strong' || tagName === 'b') {
      const content = processChildren(elem, indent);
      // Add spaces around bold markers for better rendering
      // Check if there's text before/after this element
      const prevSibling = elem.previousSibling;
      const nextSibling = elem.nextSibling;
      const needSpaceBefore = prevSibling && prevSibling.nodeType === Node.TEXT_NODE &&
                              prevSibling.textContent && /\S$/.test(prevSibling.textContent);
      const needSpaceAfter = nextSibling && nextSibling.nodeType === Node.TEXT_NODE &&
                             nextSibling.textContent && /^\S/.test(nextSibling.textContent);

      return (needSpaceBefore ? ' ' : '') + '**' + content + '**' + (needSpaceAfter ? ' ' : '');
    }

    // Italic
    if (tagName === 'em' || tagName === 'i') {
      const content = processChildren(elem, indent);
      // Add spaces around italic markers for better rendering
      const prevSibling = elem.previousSibling;
      const nextSibling = elem.nextSibling;
      const needSpaceBefore = prevSibling && prevSibling.nodeType === Node.TEXT_NODE &&
                              prevSibling.textContent && /\S$/.test(prevSibling.textContent);
      const needSpaceAfter = nextSibling && nextSibling.nodeType === Node.TEXT_NODE &&
                             nextSibling.textContent && /^\S/.test(nextSibling.textContent);

      return (needSpaceBefore ? ' ' : '') + '*' + content + '*' + (needSpaceAfter ? ' ' : '');
    }

    // Links
    if (tagName === 'a') {
      const href = elem.getAttribute('href') || '';
      const text = processChildren(elem, indent);
      return `[${text}](${href})`;
    }

    // Images
    if (tagName === 'img') {
      let src = elem.getAttribute('src') || '';
      const alt = elem.getAttribute('alt') || '';

      // Handle blob URLs (should have been converted already, but check just in case)
      if (src.startsWith('blob:')) {
        console.log('[Image] Warning: Found unconverted blob URL during markdown conversion');
        console.log('[Image] This should have been converted earlier. Adding placeholder.');
        return `\n> ⚠️ **[User uploaded image - not available]**\n> Gemini uses temporary blob URLs for uploaded images. The image could not be converted.\n\n`;
      }

      // For Gemini: Try alternative attributes if src is empty
      if (!src) {
        src = elem.getAttribute('data-src') ||
              elem.getAttribute('data-original-src') ||
              elem.getAttribute('data-image-url') ||
              elem.getAttribute('data-url') || '';

        if (!src) {
          console.log('[Image] Skipping image with empty URL');
          return '';
        }
      }

      // Check if this is a base64 image (converted from blob)
      if (src.startsWith('data:image/')) {
        console.log('[Image] Including base64 image in markdown');
      }

      return `![${alt}](${src})`;
    }

    // Handle Gemini custom image elements (image-query, uploaded-image, etc.)
    if (tagName === 'image-query' || tagName === 'uploaded-image' ||
        elem.classList.contains('uploaded-image') ||
        elem.classList.contains('image-container')) {
      // Try to extract image URL from nested img element
      const imgElement = elem.querySelector('img');
      if (imgElement) {
        let src = imgElement.getAttribute('src') ||
                 imgElement.getAttribute('data-src') ||
                 imgElement.getAttribute('data-original-src') || '';
        const alt = imgElement.getAttribute('alt') || 'Image';

        if (src && !src.startsWith('blob:')) {
          return `![${alt}](${src})`;
        }
      }

      // Try to get URL from data attributes on the container
      let imageUrl = elem.getAttribute('data-image-url') ||
                    elem.getAttribute('data-src') ||
                    elem.getAttribute('data-url') ||
                    elem.getAttribute('src') || '';

      if (imageUrl && !imageUrl.startsWith('blob:')) {
        return `![Image](${imageUrl})`;
      }

      console.log('[Image] Skipping custom image element with no valid URL');
      return '';
    }

    // Headers
    if (tagName.match(/^h[1-6]$/)) {
      const level = parseInt(tagName[1]);
      // Apply the heading level offset to normalize headings in each message block
      // The offset is calculated so the highest heading becomes h2
      const adjustedLevel = Math.max(2, Math.min(level + headingLevelOffset, 6));
      return '\n' + '#'.repeat(adjustedLevel) + ' ' + processChildren(elem, indent) + '\n\n';
    }

    // Paragraphs
    if (tagName === 'p') {
      const content = processChildren(elem, indent);
      // Paragraphs should be separated by blank lines in Markdown
      return content + '\n\n';
    }

    // Line breaks
    if (tagName === 'br') {
      return '\n';
    }

    // Blockquotes
    if (tagName === 'blockquote') {
      const content = processChildren(elem, indent);
      // Split by newlines, filter out empty lines at the end, then add '> ' prefix
      const lines = content.split('\n');
      // Remove trailing empty lines
      while (lines.length > 0 && lines[lines.length - 1].trim() === '') {
        lines.pop();
      }
      return lines.map(line => '> ' + line).join('\n') + '\n\n';
    }

    // Tables
    if (tagName === 'table') {
      return processTable(elem);
    }

    // Ordered lists
    if (tagName === 'ol') {
      const startAttr = elem.getAttribute('start');
      const startNum = startAttr ? parseInt(startAttr, 10) : 1;
      const items = Array.from(elem.children).filter(child => child.tagName.toLowerCase() === 'li');

      // Check if any item has nested lists
      const hasNestedLists = items.some(li =>
        li.querySelector('ul, ol') !== null
      );

      // Check if this is a top-level list (no indent) or nested list
      const isTopLevel = indent === '';

      let result = '\n';
      items.forEach((li, index) => {
        const itemNumber = startNum + index;
        const itemContent = processListItem(li as HTMLElement, indent + '   ', itemNumber); // 3 spaces for nested content
        result += itemContent;

        // Add blank line between items if:
        // 1. This is a top-level list, OR
        // 2. Any item in this list has nested lists (for consistency)
        // But not after the last item
        if ((isTopLevel || hasNestedLists) && index < items.length - 1) {
          result += '\n';
        }
      });
      return result;
    }

    // Unordered lists
    if (tagName === 'ul') {
      const items = Array.from(elem.children).filter(child => child.tagName.toLowerCase() === 'li');

      // Check if any item has nested lists
      const hasNestedLists = items.some(li =>
        li.querySelector('ul, ol') !== null
      );

      // Check if this is a top-level list (no indent) or nested list
      const isTopLevel = indent === '';

      let result = '\n';
      items.forEach((li, index) => {
        const itemContent = processListItem(li as HTMLElement, indent + '  '); // 2 spaces for nested content
        result += itemContent;

        // Add blank line between items if:
        // 1. This is a top-level list, OR
        // 2. Any item in this list has nested lists (for consistency)
        // But not after the last item
        if ((isTopLevel || hasNestedLists) && index < items.length - 1) {
          result += '\n';
        }
      });
      return result;
    }

    // List items - process children directly
    if (tagName === 'li') {
      return processChildren(elem, indent);
    }

    // Divs and spans - just process children
    if (tagName === 'div' || tagName === 'span') {
      return processChildren(elem, indent);
    }

    // Default: process children
    return processChildren(elem, indent);
  }

  return '';
}

/**
 * Process all children of an element
 */
function processChildren(elem: HTMLElement, indent: string = ''): string {
  let result = '';
  for (const child of Array.from(elem.childNodes)) {
    result += nodeToMarkdown(child, indent);
  }
  return result;
}

/**
 * Process a table element and convert it to Markdown table format
 */
function processTable(table: HTMLElement): string {
  const rows: string[][] = [];
  let hasHeader = false;

  // Process thead
  const thead = table.querySelector('thead');
  if (thead) {
    hasHeader = true;
    const headerRows = thead.querySelectorAll('tr');
    headerRows.forEach(tr => {
      const cells: string[] = [];
      tr.querySelectorAll('th, td').forEach(cell => {
        const cellContent = getCellContent(cell as HTMLElement);
        cells.push(cellContent);
      });
      if (cells.length > 0) {
        rows.push(cells);
      }
    });
  }

  // Process tbody
  const tbody = table.querySelector('tbody');
  if (tbody) {
    const bodyRows = tbody.querySelectorAll('tr');
    bodyRows.forEach(tr => {
      const cells: string[] = [];
      tr.querySelectorAll('td, th').forEach(cell => {
        const cellContent = getCellContent(cell as HTMLElement);
        cells.push(cellContent);
      });
      if (cells.length > 0) {
        rows.push(cells);
      }
    });
  }

  // If no thead, check if first row should be header
  if (!hasHeader && rows.length > 0) {
    hasHeader = true;
  }

  if (rows.length === 0) {
    return '';
  }

  // Build markdown table
  let result = '\n';

  // Add header row
  if (hasHeader && rows.length > 0) {
    const headerRow = rows[0];
    result += '| ' + headerRow.join(' | ') + ' |\n';

    // Add separator row
    result += '| ' + headerRow.map(() => '---').join(' | ') + ' |\n';

    // Add data rows
    for (let i = 1; i < rows.length; i++) {
      result += '| ' + rows[i].join(' | ') + ' |\n';
    }
  } else {
    // No header, all rows are data
    rows.forEach(row => {
      result += '| ' + row.join(' | ') + ' |\n';
    });
  }

  result += '\n';
  return result;
}

/**
 * Get the text content of a table cell, handling special elements
 */
function getCellContent(cell: HTMLElement): string {
  let content = '';

  // Process child nodes to handle formatting
  for (const child of Array.from(cell.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      content += child.textContent || '';
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const elem = child as HTMLElement;
      const tagName = elem.tagName.toLowerCase();

      // Handle special elements
      // Check for KaTeX/math-inline first (before handling bold/italic)
      if (elem.classList.contains('katex') || elem.classList.contains('math-inline')) {
        // Use nodeToMarkdown to properly handle KaTeX
        content += nodeToMarkdown(elem, '');
      } else if (tagName === 'strong' || tagName === 'b') {
        // Check if bold contains KaTeX
        const hasKatex = elem.querySelector('.katex, .math-inline');
        if (hasKatex) {
          // Recursively process children to handle KaTeX properly
          content += '**';
          for (const grandChild of Array.from(elem.childNodes)) {
            if (grandChild.nodeType === Node.TEXT_NODE) {
              content += grandChild.textContent || '';
            } else if (grandChild.nodeType === Node.ELEMENT_NODE) {
              const grandElem = grandChild as HTMLElement;
              if (grandElem.classList.contains('katex') || grandElem.classList.contains('math-inline')) {
                content += nodeToMarkdown(grandElem, '');
              } else {
                content += grandElem.textContent || '';
              }
            }
          }
          content += '**';
        } else {
          content += '**' + (elem.textContent || '') + '**';
        }
      } else if (tagName === 'em' || tagName === 'i') {
        content += '*' + (elem.textContent || '') + '*';
      } else if (tagName === 'code') {
        content += '`' + (elem.textContent || '') + '`';
      } else if (tagName === 'a') {
        const href = elem.getAttribute('href') || '';
        const text = elem.textContent || '';
        content += `[${text}](${href})`;
      } else if (tagName === 'br') {
        content += ' ';
      } else {
        // For other elements, just get text content
        content += elem.textContent || '';
      }
    }
  }

  // Clean up the content
  content = content.trim();
  // Replace newlines with spaces in table cells
  content = content.replace(/\n+/g, ' ');
  // Replace multiple spaces with single space
  content = content.replace(/\s+/g, ' ');

  return content;
}

/**
 * Process a list item with special handling for nested structures
 * @param li - The list item element
 * @param indent - The indentation string for nested content
 * @param itemNumber - Optional number for ordered lists
 */
function processListItem(li: HTMLElement, indent: string, itemNumber?: number): string {
  let result = '';
  const children = Array.from(li.childNodes);

  // Separate text/inline content from block elements (ul, ol, p)
  let inlineContent = '';
  let blockElements: Node[] = [];

  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) {
      inlineContent += child.textContent || '';
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const elem = child as HTMLElement;
      const tagName = elem.tagName.toLowerCase();

      // Block elements that should be on separate lines
      if (tagName === 'ul' || tagName === 'ol') {
        blockElements.push(child);
      } else if (tagName === 'p') {
        // Check if this paragraph contains only bold text (likely a heading)
        const boldChild = elem.querySelector('b, strong');
        if (boldChild && boldChild.textContent?.trim() === elem.textContent?.trim()) {
          // This is a heading paragraph
          inlineContent += processChildren(elem, indent).trim();
        } else {
          // Regular paragraph content
          inlineContent += processChildren(elem, indent).trim();
        }
      } else {
        // Inline elements
        inlineContent += nodeToMarkdown(child, indent);
      }
    }
  }

  // Add the main list item line
  const trimmedInline = inlineContent.trim();
  if (trimmedInline) {
    const marker = itemNumber !== undefined ? `${itemNumber}. ` : '- ';
    const baseIndent = itemNumber !== undefined ? indent.slice(0, -3) : indent.slice(0, -2);
    result += baseIndent + marker + trimmedInline + '\n';
  }

  // Add block elements (nested lists) with proper indentation
  for (const blockElem of blockElements) {
    // Add a blank line before nested list for better readability (Markdown standard)
    if (trimmedInline) {
      result += '\n';
    }
    const blockContent = nodeToMarkdown(blockElem, indent);
    // The nested list already has proper indentation from nodeToMarkdown
    result += blockContent;
  }

  return result;
}

/**
 * Remove unwanted UI elements from the DOM before conversion
 * This includes buttons, footers, and other non-content elements
 */
function cleanupUIElements(container: HTMLElement): void {
  // First pass: Remove specific UI elements by selector
  const selectorsToRemove = [
    // Thinking/reasoning UI elements (Claude, etc.)
    '.thoughts-header-button-content',
    '[class*="thoughts-header-button"]',
    '[class*="thinking-header-button"]',
    '.mat-mdc-button-ripple',
    '[class*="button-ripple"]',

    // Generic UI elements
    'button',
    '.button',
    '[role="button"]',

    // Navigation and controls
    'nav',
    '.navigation',
    '.controls',

    // Tooltips and overlays
    '.tooltip',
    '.overlay',
    '.popup',

    // Hidden elements
    '[hidden]',
    '[style*="display: none"]',
    '[style*="display:none"]',

    // Aria-hidden elements (usually decorative)
    '[aria-hidden="true"]',

    // ChatGPT retry indicators (e.g., "2/2")
    '.tabular-nums',
    '[class*="tabular-nums"]',

    // Gemini Deep Research: source icons and carousel elements
    'sources-carousel',
    'sources-carousel-inline',
    'card-renderer',
    'default-source-card',
    'url-source-card',
  ];

  // Remove all matching elements
  selectorsToRemove.forEach(selector => {
    try {
      const elements = container.querySelectorAll(selector);
      elements.forEach(el => el.remove());
    } catch (e) {
      // Ignore invalid selectors
    }
  });

  // Second pass: Remove elements with specific text content that are likely UI elements
  const textPatternsToRemove = [
    /^导出到\s*Google\s*表格$/i,
    /^Export to\s*Google\s*Sheets$/i,
    /^复制$/i,
    /^Copy$/i,
    /^下载$/i,
    /^Download$/i,
    /^显示思路$/i,
    /^Show\s*thinking$/i,
    /^隐藏思路$/i,
    /^Hide\s*thinking$/i,
    /^思考过程$/i,
    /^Thinking$/i,
    // ChatGPT specific headers
    /^您说[：:]\s*$/i,
    /^ChatGPT\s*说[：:]\s*$/i,
    /^You\s+said[：:]\s*$/i,
    /^ChatGPT\s+said[：:]\s*$/i,
    // Retry indicators (e.g., "2/2", "1/3", etc.)
    /^\d+\/\d+$/,
  ];

  // Find and remove elements matching text patterns
  // We need to be careful not to remove parent elements that contain tables
  const allElements = Array.from(container.querySelectorAll('*'));
  allElements.forEach(el => {
    // Skip if element is a table or contains a table
    if (el.tagName.toLowerCase() === 'table' || el.querySelector('table')) {
      return;
    }

    const text = el.textContent?.trim() || '';
    if (textPatternsToRemove.some(pattern => pattern.test(text))) {
      // Only remove if this is a leaf element or small element (likely a button)
      if (el.children.length === 0 || text.length < 50) {
        el.remove();
      }
    }
  });

  // Third pass: Remove table footers and export buttons specifically
  // Look for divs that come after tables and contain button-like text
  const tables = container.querySelectorAll('table');
  tables.forEach(table => {
    let nextSibling = table.nextElementSibling;
    while (nextSibling) {
      const text = nextSibling.textContent?.trim() || '';
      const isFooter =
        nextSibling.classList.contains('table-footer') ||
        /导出|export|复制|copy|下载|download/i.test(text);

      if (isFooter && text.length < 100) {
        const toRemove = nextSibling;
        nextSibling = nextSibling.nextElementSibling;
        toRemove.remove();
      } else {
        break;
      }
    }
  });
}

/**
 * Convert HTML to Markdown for chat messages
 * This is a lightweight converter focused on chat content
 */
export function chatHtmlToMarkdown(html: string): string {
  if (!html) return '';

  // Create a temporary div to parse HTML properly
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  // Remove unwanted UI elements before conversion
  cleanupUIElements(tempDiv);

  // Find the highest (smallest number) heading level in this message block
  // This will be normalized to h2 (since h1 is reserved for USER/ASSISTANT)
  const headings = tempDiv.querySelectorAll('h1, h2, h3, h4, h5, h6');
  let minHeadingLevel = 7; // Start with a value higher than any heading level
  headings.forEach(h => {
    const level = parseInt(h.tagName[1]);
    if (level < minHeadingLevel) {
      minHeadingLevel = level;
    }
  });

  // Calculate the offset needed to make the highest heading become h2
  // For example: if minHeadingLevel is 3 (h3), offset should be 2 - 3 = -1
  // So h3 becomes h2, h4 becomes h3, etc.
  if (minHeadingLevel <= 6) {
    headingLevelOffset = 2 - minHeadingLevel;
  } else {
    // No headings found, use default offset of 0
    headingLevelOffset = 0;
  }

  // Convert the DOM tree to markdown
  let markdown = processChildren(tempDiv);

  // Clean up HTML entities
  markdown = markdown
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // Clean up extra whitespace
  markdown = markdown
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Multiple newlines to double
    .replace(/^\s+|\s+$/g, ''); // Trim start and end
    // Note: We don't collapse multiple spaces globally because Markdown uses
    // leading spaces for list indentation. Instead, we only collapse spaces
    // within text content (not at line start).

  return markdown;
}
