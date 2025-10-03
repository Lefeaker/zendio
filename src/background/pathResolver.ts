import type { Options } from './store';
import type { ClipPayload } from './types/messages';
import type { ClassificationResult } from './services/classificationService';

type TemplateConfig = Options['templates'] & { clipper?: string };

type DomainMappings = Record<string, string> | undefined;

type TemplateKey = 'article' | 'fragment' | 'ai' | 'clipper';

type TemplateValueGetter = (templates: TemplateConfig, key: TemplateKey) => string;

const defaultTemplates: Record<TemplateKey, string> = {
  ai: 'AI/{platform}/{yyyy}/{yyyy}-{mm}-{dd}_{title}.md',
  fragment: 'Fragments/{yyyy}/{mm}/{dd}/{title}.md',
  clipper: 'Clippings/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
  article: 'Articles/{domain}/{yyyy}/{slug}.md'
};

const getTemplateValue: TemplateValueGetter = (templates, key) => {
  const templateRecord = templates as Partial<Record<TemplateKey, string>>;
  const value = templateRecord[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return defaultTemplates[key];
};

export function resolvePath(
  templates: TemplateConfig,
  payload: ClipPayload,
  classification: ClassificationResult,
  domainMappings?: DomainMappings
): string {
  const createdAt = new Date();
  const yyyy = createdAt.getFullYear();
  const mm = String(createdAt.getMonth() + 1).padStart(2, '0');
  const dd = String(createdAt.getDate()).padStart(2, '0');

  const safe = (value: string | undefined): string => {
    if (!value) return 'note';
    return value.replace(/[\\/:*?"<>|]/g, '_').slice(0, 180);
  };

  const slug = (value: string): string => safe(value).toLowerCase().replace(/\s+/g, '-');
  const title = payload.title || 'Untitled';

  switch (payload.type) {
    case 'ai_chat': {
      const template = getTemplateValue(templates, 'ai');
      const platform = payload.meta?.platform || classification.ai_platform || 'chat';
      return template
        .replace('{platform}', platform)
        .replace('{yyyy}', String(yyyy))
        .replace('{mm}', mm)
        .replace('{dd}', dd)
        .replace('{title}', safe(title));
    }

    case 'fragment': {
      const template = getTemplateValue(templates, 'fragment');
      const domain = resolveDomain(payload, domainMappings);
      return template
        .replace('{domain}', safe(domain))
        .replace('{yyyy}', String(yyyy))
        .replace('{mm}', mm)
        .replace('{dd}', dd)
        .replace('{slug}', slug(title))
        .replace('{title}', safe(title));
    }

    case 'clipper': {
      const template = getTemplateValue(templates, 'clipper');
      const domain = resolveDomain(payload, domainMappings);
      return template
        .replace('{domain}', safe(domain))
        .replace('{yyyy}', String(yyyy))
        .replace('{mm}', mm)
        .replace('{dd}', dd)
        .replace('{slug}', slug(title));
    }

    default: {
      const template = getTemplateValue(templates, 'article');
      const domain = resolveDomain(payload, domainMappings);
      return template
        .replace('{domain}', safe(domain))
        .replace('{yyyy}', String(yyyy))
        .replace('{mm}', mm)
        .replace('{dd}', dd)
        .replace('{slug}', slug(title))
        .replace('{title}', safe(title));
    }
  }
}

function resolveDomain(payload: ClipPayload, domainMappings?: DomainMappings): string {
  const urlDomain = deriveDomainFromUrl(payload.meta?.url);
  const domain = payload.meta?.domain || urlDomain || 'unknown';
  if (!domainMappings) {
    return domain;
  }
  return domainMappings[domain] ?? domain;
}

function deriveDomainFromUrl(url?: string): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
