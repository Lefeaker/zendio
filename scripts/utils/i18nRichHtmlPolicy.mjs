import { JSDOM } from 'jsdom';

const RICH_HTML_ALLOWED_KEYS = new Set([
  'contactModalDescription',
  'schemaResourceContactDescription'
]);
const RICH_HTML_ALLOWED_TAGS = new Set(['a', 'br', 'strong', 'em', 'code']);
const RICH_HTML_FORBIDDEN_TAGS = new Set([
  'script',
  'style',
  'template',
  'iframe',
  'object',
  'embed'
]);
const RICH_HTML_ALLOWED_PROTOCOLS = new Set(['https:', 'mailto:']);
const HTML_TAG_RE = /<\s*\/?\s*[a-zA-Z][^>]*>/;

function stripUnsafeHrefCharacters(rawHref) {
  let result = '';

  for (const character of rawHref.trim()) {
    const codePoint = character.charCodeAt(0);
    if (codePoint <= 0x20 || codePoint === 0x7f) {
      continue;
    }
    result += character;
  }

  return result;
}

function hasSafeHrefProtocol(rawHref) {
  const normalised = stripUnsafeHrefCharacters(rawHref);
  if (normalised.length === 0) {
    return false;
  }

  try {
    const url = new URL(normalised);
    return RICH_HTML_ALLOWED_PROTOCOLS.has(url.protocol);
  } catch {
    return false;
  }
}

function isJavascriptUrl(rawValue) {
  return /javascript\s*:/i.test(stripUnsafeHrefCharacters(rawValue));
}

function formatIssue(language, key, message) {
  return `[rich-html:${language}:${key}] ${message}`;
}

function validateElement(element, language, key, errors) {
  const tagName = element.tagName.toLowerCase();

  if (RICH_HTML_FORBIDDEN_TAGS.has(tagName)) {
    errors.push(formatIssue(language, key, `forbidden tag <${tagName}> is not allowed`));
  } else if (!RICH_HTML_ALLOWED_TAGS.has(tagName)) {
    errors.push(formatIssue(language, key, `tag <${tagName}> is not in the rich HTML allowlist`));
  }

  for (const attribute of Array.from(element.attributes)) {
    const attributeName = attribute.name.toLowerCase();
    const attributeValue = attribute.value;

    if (attributeName.startsWith('on')) {
      errors.push(
        formatIssue(
          language,
          key,
          `event attributes are forbidden: ${attribute.name}`
        )
      );
    }

    if (isJavascriptUrl(attributeValue)) {
      errors.push(
        formatIssue(language, key, `unsafe javascript URL in ${attribute.name}`)
      );
    }

    if (
      tagName === 'a'
      && attributeName === 'href'
      && !hasSafeHrefProtocol(attributeValue)
    ) {
      errors.push(formatIssue(language, key, `unsafe href protocol: ${attributeValue}`));
    }
  }

  for (const child of Array.from(element.children)) {
    validateElement(child, language, key, errors);
  }
}

function validateRichHtmlValue(language, key, value) {
  const errors = [];
  const dom = new JSDOM('<!doctype html>');
  const template = dom.window.document.createElement('template');
  template.innerHTML = value;

  for (const element of Array.from(template.content.children)) {
    validateElement(element, language, key, errors);
  }

  dom.window.close();
  return errors;
}

export function validateRichHtmlCatalogMessages(localeMessages) {
  const errors = [];

  for (const [language, messages] of Object.entries(localeMessages)) {
    for (const [key, value] of Object.entries(messages)) {
      if (!HTML_TAG_RE.test(value)) {
        continue;
      }

      if (!RICH_HTML_ALLOWED_KEYS.has(key)) {
        errors.push(
          formatIssue(
            language,
            key,
            `HTML tags are only allowed for ${Array.from(RICH_HTML_ALLOWED_KEYS).join(', ')}`
          )
        );
      }

      errors.push(...validateRichHtmlValue(language, key, value));
    }
  }

  return errors;
}
