import { RELEASE_LANGUAGE_ORDER } from '@i18n/catalog/languages';

const EXPECTED_LANGUAGE_VALUES = [...RELEASE_LANGUAGE_ORDER];
const RESIDUAL_CHINESE_RE = /[\u4e00-\u9fff]/u;

function findLanguageSelect(root: ParentNode): HTMLSelectElement | null {
  return (
    Array.from(root.querySelectorAll<HTMLSelectElement>('select')).find((candidate) => {
      const values = Array.from(candidate.options).map((option) => option.value);
      return (
        values.length === EXPECTED_LANGUAGE_VALUES.length &&
        values.every((value, index) => value === EXPECTED_LANGUAGE_VALUES[index])
      );
    }) ?? null
  );
}

function requireLanguageSelect(root: ParentNode): HTMLSelectElement {
  const select = findLanguageSelect(root);
  if (!select) {
    throw new Error('Missing production language select');
  }
  return select;
}

function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

export function getLanguageSelectValues(root: ParentNode): string[] {
  return Array.from(requireLanguageSelect(root).options).map((option) => option.value);
}

export function collectTextExcludingLanguageOptions(
  root: ParentNode,
  allowedPhrases: readonly string[] = []
): string {
  const cloneSource = root instanceof Document ? root.body : (root as Node & ParentNode);
  const clone = cloneSource.cloneNode(true) as Node & ParentNode;
  const languageSelect = findLanguageSelect(clone);
  languageSelect?.querySelectorAll('option').forEach((option) => option.remove());
  let text = normalizeWhitespace(clone.textContent ?? '');
  for (const phrase of allowedPhrases) {
    text = text.replaceAll(phrase, '');
  }
  return text;
}

export function expectNoChineseSettingsCopy(
  root: ParentNode,
  options: { allowedPhrases?: readonly string[] } = {}
): void {
  const text = collectTextExcludingLanguageOptions(root, options.allowedPhrases);
  const match = text.match(RESIDUAL_CHINESE_RE);
  if (!match) {
    return;
  }

  const index = match.index ?? 0;
  const snippet = text.slice(Math.max(0, index - 24), Math.min(text.length, index + 24));
  throw new Error(`Found residual Chinese copy outside language options: ${snippet}`);
}
