const LANGUAGE_ALIAS_MAP: Record<string, string> = {
  'c++': 'cpp',
  'c#': 'csharp',
  'f#': 'fsharp',
  'plain text': 'text',
  plaintext: 'text',
  shell: 'bash',
  sh: 'bash',
  ps: 'powershell',
  ps1: 'powershell',
  objc: 'objective-c',
  'objective c': 'objective-c',
  'objective-c': 'objective-c',
  js: 'javascript',
  ts: 'typescript'
};

const CODE_LABEL_SKIP_SELECTOR =
  'button, .button, [role="button"], [class*="copy" i], [class*="action" i], [class*="toolbar" i]';

const KNOWN_LANGUAGE_LABELS: Set<string> = new Set([
  'bash',
  'c',
  'c++',
  'cpp',
  'c#',
  'csharp',
  'clojure',
  'cmake',
  'cmd',
  'css',
  'dart',
  'dockerfile',
  'elixir',
  'erlang',
  'fish',
  'f#',
  'fsharp',
  'fortran',
  'go',
  'golang',
  'graphql',
  'groovy',
  'haskell',
  'html',
  'ini',
  'java',
  'javascript',
  'json',
  'julia',
  'kotlin',
  'latex',
  'less',
  'lua',
  'makefile',
  'markdown',
  'matlab',
  'md',
  'nim',
  'objective c',
  'objective-c',
  'objc',
  'ocaml',
  'perl',
  'php',
  'plain text',
  'plaintext',
  'powershell',
  'proto',
  'protobuf',
  'python',
  'r',
  'jsx',
  'reasonml',
  'ruby',
  'rust',
  'sas',
  'scala',
  'scheme',
  'scss',
  'shell',
  'sh',
  'sql',
  'stata',
  'swift',
  'tex',
  'text',
  'toml',
  'ts',
  'tsx',
  'typescript',
  'vb',
  'vb.net',
  'visual basic',
  'wasm',
  'webassembly',
  'xml',
  'yaml',
  'yml',
  'zig'
]);

let pendingCodeLanguageLabel: string | null = null;

export function resetPendingCodeLanguageLabel(): void {
  pendingCodeLanguageLabel = null;
}

export function consumePendingCodeLanguageLabel(): string | null {
  const value = pendingCodeLanguageLabel;
  pendingCodeLanguageLabel = null;
  return value;
}

export function resolveLanguageLabel(label: string): string | null {
  if (!label) {
    return null;
  }

  const trimmed = label.trim().replace(/[：:]+$/, '');
  if (!trimmed) {
    return null;
  }

  const lower = trimmed.toLowerCase();
  if (LANGUAGE_ALIAS_MAP[lower]) {
    return LANGUAGE_ALIAS_MAP[lower];
  }
  if (KNOWN_LANGUAGE_LABELS.has(lower)) {
    return trimmed === trimmed.toUpperCase() ? lower : trimmed;
  }

  const collapsedLower = lower.replace(/\s+/g, '');
  if (LANGUAGE_ALIAS_MAP[collapsedLower]) {
    return LANGUAGE_ALIAS_MAP[collapsedLower];
  }
  if (KNOWN_LANGUAGE_LABELS.has(collapsedLower)) {
    const collapsedOriginal = trimmed.replace(/\s+/g, '');
    return collapsedOriginal === collapsedOriginal.toUpperCase()
      ? collapsedLower
      : collapsedOriginal;
  }

  return null;
}

export function normalizeLanguageTag(label: string): string {
  const resolved = resolveLanguageLabel(label);
  if (resolved) {
    return resolved;
  }

  const trimmed = label.trim();
  if (!trimmed) {
    return '';
  }
  return trimmed === trimmed.toUpperCase() ? trimmed.toLowerCase() : trimmed;
}

function findAssociatedPreElement(elem: HTMLElement): HTMLElement | null {
  let current = elem.nextElementSibling as HTMLElement | null;
  while (current) {
    if (current.matches(CODE_LABEL_SKIP_SELECTOR)) {
      current = current.nextElementSibling as HTMLElement | null;
      continue;
    }
    if (current.tagName.toLowerCase() === 'pre') {
      return current;
    }
    const nestedPre = current.querySelector?.('pre');
    if (nestedPre) {
      return nestedPre as HTMLElement;
    }
    break;
  }

  const parent = elem.parentElement;
  if (parent) {
    const candidate = parent.querySelector('pre');
    if (candidate) {
      const relation = elem.compareDocumentPosition(candidate);
      if (relation & Node.DOCUMENT_POSITION_FOLLOWING) {
        return candidate as HTMLElement;
      }
    }
  }

  return null;
}

function isLikelyLanguageLabel(elem: HTMLElement, text: string): boolean {
  const preElement = findAssociatedPreElement(elem);
  if (!preElement || !preElement.querySelector('code')) {
    return false;
  }

  const classAttr = elem.getAttribute('class') || '';
  const attrLanguage =
    elem.getAttribute('data-language') ||
    elem.getAttribute('data-code-language') ||
    elem.getAttribute('data-lang');

  if (attrLanguage || resolveLanguageLabel(text)) {
    return true;
  }
  if (/\b(language|lang|syntax|code|chip|badge|toolbar|label)\b/i.test(classAttr)) {
    return true;
  }
  return Boolean(text && text === text.toUpperCase() && text.length <= 15);
}

export function captureLanguageLabel(elem: HTMLElement): boolean {
  if (elem.querySelector('pre')) {
    return false;
  }

  const textContent = elem.textContent?.trim() || '';
  if (!textContent || !isLikelyLanguageLabel(elem, textContent)) {
    return false;
  }

  const attrLanguage =
    elem.getAttribute('data-language') ||
    elem.getAttribute('data-code-language') ||
    elem.getAttribute('data-lang');

  const labelSource = attrLanguage || textContent;
  pendingCodeLanguageLabel = normalizeLanguageTag(labelSource) || labelSource.trim() || null;
  return true;
}

export function captureLanguageLabelFromTextNode(node: Node, rawText: string): boolean {
  const resolvedLabel = resolveLanguageLabel(rawText);
  if (!resolvedLabel) {
    return false;
  }

  let sibling: Node | null = node.nextSibling;
  while (sibling) {
    if (sibling.nodeType === Node.TEXT_NODE) {
      const siblingText = sibling.textContent || '';
      if (siblingText.trim() === '') {
        sibling = sibling.nextSibling;
        continue;
      }
      return false;
    }

    if (sibling.nodeType === Node.ELEMENT_NODE) {
      const elem = sibling as HTMLElement;
      if (elem.matches(CODE_LABEL_SKIP_SELECTOR)) {
        sibling = elem.nextSibling;
        continue;
      }
      if (elem.tagName.toLowerCase() === 'pre' || elem.querySelector('pre')) {
        pendingCodeLanguageLabel = normalizeLanguageTag(resolvedLabel);
        return true;
      }
      break;
    }

    break;
  }

  const parent = node.parentElement;
  if (parent && findAssociatedPreElement(parent)) {
    pendingCodeLanguageLabel = normalizeLanguageTag(resolvedLabel);
    return true;
  }

  return false;
}
