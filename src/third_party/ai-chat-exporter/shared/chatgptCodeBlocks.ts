import { normalizeLanguageTag, resolveLanguageLabel } from './markdownLanguage';

const CODE_BLOCK = '[data-code-block="true"]';
const NON_CONTENT =
  '[hidden], [aria-hidden="true"], button, [role="button"], [style*="display: none"], [style*="display:none"]';

type CodeBlock = { source: Element; code: Element; header?: Element; language: string };

function contentText(root: Element, excluded: Element[] = []): string {
  const walker = root.ownerDocument.createTreeWalker(root, 4);
  let text = '';
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (
      !node.parentElement?.closest(NON_CONTENT) &&
      !excluded.some((element) => element.contains(node))
    )
      text += node.textContent ?? '';
  }
  return text;
}

function codeBlocks(root: Element): CodeBlock[] {
  const blocks: CodeBlock[] = [];
  for (const block of Array.from(root.querySelectorAll(CODE_BLOCK))) {
    const source = Array.from(block.children).find((element) =>
      element.matches('[data-code-block-source="true"]')
    );
    const codes = source?.querySelectorAll('code');
    const code = codes?.[0];
    if (!source || !code || codes?.length !== 1 || code.closest(NON_CONTENT)) continue;
    const header = Array.from(block.children).find((element) =>
      element.matches('[data-markdown-copy="exclude"]')
    );
    const pre = code.closest('pre');
    const explicitLanguage =
      code.getAttribute('data-language') ||
      (pre && source.contains(pre)
        ? pre.getAttribute('data-language') ||
          pre.getAttribute('data-code-language') ||
          pre.getAttribute('data-lang')
        : null) ||
      source.getAttribute('data-language') ||
      source.getAttribute('data-code-language') ||
      source.getAttribute('data-lang') ||
      Array.from(code.classList)
        .find((name) => name.startsWith('language-'))
        ?.slice(9);
    const language = explicitLanguage
      ? normalizeLanguageTag(explicitLanguage)
      : resolveLanguageLabel(header ? contentText(header) : '') || '';
    blocks.push({ source, code, ...(header ? { header } : {}), language });
  }
  return blocks;
}

// Only call on a parser-owned clone. The source page must keep its live widgets.
export function normalizeChatGPTCodeBlocks(root: Element): void {
  for (const { source, code, header, language } of codeBlocks(root)) {
    const pre = root.ownerDocument.createElement('pre');
    if (language) pre.setAttribute('data-language', language);
    pre.append(code.cloneNode(true));
    source.replaceWith(pre);
    header?.remove();
  }
}

export function chatGPTContentSignature(body: Element): string {
  const blocks = codeBlocks(body);
  const headers = blocks.flatMap((block) => (block.header ? [block.header] : []));
  // Generic action headings can mount after the code itself. Keep the explicit
  // language in the signature so a meaningful language change still rejects.
  return JSON.stringify([contentText(body, headers), blocks.map((block) => block.language)]);
}
