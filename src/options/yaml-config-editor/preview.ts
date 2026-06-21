import type { YamlContentType } from '@shared/types/yamlConfig';
import { parseDefaultValue } from './codecs';
import type { YamlEditorFilter } from './rowModel';
import { YAML_EDITOR_CONTENT_TYPES, type YamlEditorField, type YamlEditorState } from './types';

type PreviewLabels = Partial<Record<YamlContentType, string>>;
type PreviewScalar = string | number | boolean;
type PreviewArray = PreviewScalar[];
interface PreviewContext {
  [key: string]: PreviewScalar | PreviewArray | PreviewContext | undefined;
}
type PreviewValue = PreviewScalar | PreviewArray | PreviewContext | undefined;

const DEFAULT_PREVIEW_LABELS: Record<YamlContentType, string> = {
  article: 'Article',
  clipper: 'Clipper',
  video: 'Video',
  ai_chat: 'AI'
};

const SAMPLE_CONTEXTS: Record<YamlContentType, PreviewContext> = {
  article: {
    type: 'article',
    title: 'article_sample',
    url: 'https://example.com/research-article',
    clipped_at: '2026-04-08T18:32:00+08:00',
    tags: ['clipping', 'research'],
    author: 'Jane Doe',
    published_at: '2026-04-07',
    status: ['unread'],
    metadata: {
      source: 'web',
      author: 'Jane Doe'
    }
  },
  clipper: {
    type: 'clipper',
    title: 'clipper_sample',
    url: 'https://example.com/article#selection',
    clipped_at: '2026-04-08T18:35:00+08:00',
    highlight_count: 3,
    export_mode: 'highlights',
    tags: ['clipping', 'fragment'],
    metadata: {
      source: 'web'
    }
  },
  video: {
    type: 'video',
    title: 'video_sample',
    url: 'https://www.youtube.com/watch?v=example',
    clipped_at: '2026-04-08T18:40:00+08:00',
    platform: 'YouTube',
    capture_count: 6,
    timestamp_count: 4,
    fragment_count: 2,
    tags: ['clipping', 'video'],
    metadata: {
      source: 'video'
    }
  },
  ai_chat: {
    type: 'ai_chat',
    platform: 'ChatGPT',
    model: 'GPT-5',
    url: 'https://chatgpt.com/c/example',
    message_count: 12,
    clipped_at: '2026-04-08T18:45:00+08:00',
    tags: ['clipping', 'ai-chat'],
    metadata: {
      source: 'ai'
    }
  }
};

function escapeYamlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r?\n/g, '\\n');
}

function splitPath(path: string): string[] {
  const segments: string[] = [];
  let current = '';
  for (let index = 0; index < path.length; index += 1) {
    const char = path[index];
    if (char === '.') {
      if (current) {
        segments.push(current);
        current = '';
      }
      continue;
    }
    if (char === '[') {
      if (current) {
        segments.push(current);
        current = '';
      }
      let token = '';
      index += 1;
      while (index < path.length && path[index] !== ']') {
        token += path[index];
        index += 1;
      }
      if (token) {
        segments.push(token);
      }
      continue;
    }
    current += char;
  }
  if (current) {
    segments.push(current);
  }
  return segments;
}

function isPreviewContext(value: PreviewValue): value is PreviewContext {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getByPath(source: PreviewContext, path: string | undefined): PreviewValue {
  if (!path?.trim()) {
    return undefined;
  }
  let current: PreviewValue = source;
  for (const token of splitPath(path.trim())) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index)) {
        return undefined;
      }
      current = current[index];
      continue;
    }
    if (!isPreviewContext(current)) {
      return undefined;
    }
    current = current[token];
  }
  return current;
}

function fallbackValueForField(field: YamlEditorField): PreviewValue {
  switch (field.type) {
    case 'array':
      return [`${field.name}_sample`];
    case 'boolean':
      return true;
    case 'number':
      return 1;
    case 'date':
      return '2026-04-08T18:32:00+08:00';
    case 'text':
    default:
      return `${field.name}_sample`;
  }
}

function toPreviewValue(value: ReturnType<typeof parseDefaultValue>): PreviewValue {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item));
  }
  return undefined;
}

function resolveFieldValue(field: YamlEditorField, context: PreviewContext): PreviewValue {
  const fromValuePath = getByPath(context, field.valuePath);
  if (fromValuePath !== undefined && fromValuePath !== null) {
    return fromValuePath;
  }
  const fromName = getByPath(context, field.name);
  if (fromName !== undefined && fromName !== null) {
    return fromName;
  }
  const fromDefault = toPreviewValue(parseDefaultValue(field.type, field.defaultValue));
  return fromDefault ?? fallbackValueForField(field);
}

function stringifyArrayItem(value: PreviewScalar): string {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  return `"${escapeYamlString(String(value))}"`;
}

function valueToScalar(value: PreviewValue): PreviewScalar {
  if (value === undefined || isPreviewContext(value)) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(', ');
  }
  return value;
}

function stringifyFieldValue(field: YamlEditorField, value: PreviewValue): string {
  if (field.type === 'number') {
    const numeric = typeof value === 'number' ? value : Number(valueToScalar(value));
    return Number.isFinite(numeric) ? String(numeric) : '0';
  }
  if (field.type === 'boolean') {
    if (typeof value === 'string') {
      return value.trim().toLowerCase() === 'true' ? 'true' : 'false';
    }
    return value ? 'true' : 'false';
  }
  if (field.type === 'array') {
    const items = Array.isArray(value) ? value : [valueToScalar(value)];
    return `[${items.map(stringifyArrayItem).join(', ')}]`;
  }
  return `"${escapeYamlString(String(valueToScalar(value)))}"`;
}

function contentTypesForFilter(filter: YamlEditorFilter): YamlContentType[] {
  return filter === 'all' ? YAML_EDITOR_CONTENT_TYPES : [filter];
}

function fieldsForContentType(
  state: YamlEditorState,
  contentType: YamlContentType
): YamlEditorField[] {
  const contentState = state.contentTypes[contentType];
  return [...contentState.fields, ...contentState.customFields, ...state.globalFields];
}

function buildContentTypePreview(
  state: YamlEditorState,
  contentType: YamlContentType,
  labels: PreviewLabels
): string {
  const label = labels[contentType] ?? DEFAULT_PREVIEW_LABELS[contentType];
  const context = SAMPLE_CONTEXTS[contentType];
  const lines = [`# ${label}`, '---'];
  for (const field of fieldsForContentType(state, contentType)) {
    const name = field.name.trim();
    if (!name || !field.enabled) {
      continue;
    }
    lines.push(`${name}: ${stringifyFieldValue(field, resolveFieldValue(field, context))}`);
  }
  lines.push('---');
  return lines.join('\n');
}

export function buildYamlEditorPreview(
  state: YamlEditorState,
  filter: YamlEditorFilter,
  labels: PreviewLabels = DEFAULT_PREVIEW_LABELS
): string {
  return contentTypesForFilter(filter)
    .map((contentType) => buildContentTypePreview(state, contentType, labels))
    .join('\n\n');
}
