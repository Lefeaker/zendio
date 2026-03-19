import type { Options } from './store';
import type { ClipPayload } from '../shared/types';
import type { ClassificationResult } from './services/classificationService';
import { tryParseUrl } from '../shared/url';
import { configProvider } from '../shared/config';

type TemplateConfig = Options['templates'];

type DomainMappings = Record<string, string> | undefined;

type TemplateKey = 'article' | 'fragment' | 'reading' | 'ai';

type TemplateValueGetter = (templates: TemplateConfig, key: TemplateKey) => string;

const TEMPLATE_DEFAULTS = configProvider.getTemplates();

const getTemplateValue: TemplateValueGetter = (templates, key) => {
  const templateRecord = templates as Partial<Record<TemplateKey, string>>;
  const value = templateRecord[key];
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }
  return TEMPLATE_DEFAULTS[key];
};

export function resolvePath(
  templates: TemplateConfig,
  payload: ClipPayload,
  classification: ClassificationResult,
  domainMappings?: DomainMappings
): string {
  const createdAt = new Date();
  const yyyy = createdAt.getFullYear();
  const monthTwoDigit = String(createdAt.getMonth() + 1).padStart(2, '0');
  const dd = String(createdAt.getDate()).padStart(2, '0');
  const hourTwoDigit = String(createdAt.getHours()).padStart(2, '0');
  const minuteTwoDigit = String(createdAt.getMinutes()).padStart(2, '0');
  const secondTwoDigit = String(createdAt.getSeconds()).padStart(2, '0');

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
      return populateTemplate(template, {
        platform,
        domain: resolveDomain(payload, domainMappings),
        yyyy: String(yyyy),
        mm: monthTwoDigit,
        dd,
        HH: hourTwoDigit,
        slug: slug(title),
        title: safe(title),
        HHmmss: `${hourTwoDigit}${minuteTwoDigit}${secondTwoDigit}`,
        HHmm: `${hourTwoDigit}${minuteTwoDigit}`,
        ss: secondTwoDigit
      });
    }

    case 'fragment': {
      const template = getTemplateValue(templates, 'fragment');
      const domain = resolveDomain(payload, domainMappings);
      return populateTemplate(template, {
        domain: safe(domain),
        yyyy: String(yyyy),
        mm: monthTwoDigit,
        dd,
        HH: hourTwoDigit,
        slug: slug(title),
        title: safe(title),
        HHmmss: `${hourTwoDigit}${minuteTwoDigit}${secondTwoDigit}`,
        HHmm: `${hourTwoDigit}${minuteTwoDigit}`,
        ss: secondTwoDigit,
        platform: payload.meta?.platform ?? classification.ai_platform ?? 'clipper'
      });
    }

    case 'clipper':
    case 'video': {
      const templateKey: TemplateKey = payload.meta?.readerMode ? 'reading' : 'fragment';
      const template = getTemplateValue(templates, templateKey);
      const domain = resolveDomain(payload, domainMappings);
      return populateTemplate(template, {
        domain: safe(domain),
        yyyy: String(yyyy),
        mm: monthTwoDigit,
        dd,
        HH: hourTwoDigit,
        slug: slug(title),
        title: safe(title),
        HHmmss: `${hourTwoDigit}${minuteTwoDigit}${secondTwoDigit}`,
        HHmm: `${hourTwoDigit}${minuteTwoDigit}`,
        ss: secondTwoDigit,
        platform: payload.meta?.platform ?? classification.ai_platform ?? 'clipper'
      });
    }

    default: {
      const template = getTemplateValue(templates, 'article');
      const domain = resolveDomain(payload, domainMappings);
      return populateTemplate(template, {
        domain: safe(domain),
        yyyy: String(yyyy),
        mm: monthTwoDigit,
        dd,
        HH: hourTwoDigit,
        slug: slug(title),
        title: safe(title),
        HHmmss: `${hourTwoDigit}${minuteTwoDigit}${secondTwoDigit}`,
        HHmm: `${hourTwoDigit}${minuteTwoDigit}`,
        ss: secondTwoDigit,
        platform: payload.meta?.platform ?? classification.ai_platform ?? 'article'
      });
    }
  }
}

function populateTemplate(
  template: string,
  values: Record<string, string>
): string {
  const tokenEntries = Object.entries(values).sort((a, b) => b[0].length - a[0].length);
  let result = template;
  for (const [token, value] of tokenEntries) {
    result = result.replace(new RegExp(`\\{${token}\\}`, 'g'), value ?? '');
  }
  return result;
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
  const parsed = tryParseUrl(url);
  return parsed?.hostname ?? null;
}
