import type { FragmentClipperOptions, TemplateOptions } from '../types';

export type TemplateKey = keyof TemplateOptions;

export interface RestDefaults {
  httpsHost: string;
  httpsPort?: number;
  httpHost: string;
  httpPort?: number;
  /**
   * 统一的根路径，例如 'obsidian'。
   * 默认为空字符串，表示使用根路径。
   */
  basePath?: string;
  vaultName: string;
  apiKey: string;
}

export interface LlmDefaults {
  timeoutMs: number;
  retryAttempts: number;
}

export interface UiDefaults {
  notificationTimeoutMs: number;
}

export interface ClipperDefaults {
  rest: RestDefaults;
  templates: TemplateOptions;
  fragmentClipper: FragmentClipperOptions;
  llm: LlmDefaults;
  ui: UiDefaults;
}

const DEFAULT_FRAGMENT_CLIPPER: FragmentClipperOptions = {
  useFootnoteFormat: true,
  captureContext: false,
  contextLength: 200,
  contextMode: 'chars',
  selectionModifierEnabled: true,
  selectionModifierKeys: ['shift'],
  keyboardShortcutsEnabled: true
};

const DEFAULT_TEMPLATES: TemplateOptions = {
  article: 'Articles/{domain}/{yyyy}/{slug}.md',
  video: 'Video/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
  fragment: 'Fragments/{yyyy}/{mm}/{dd}/{title}.md',
  reading: 'Reading/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
  ai: 'AI/{platform}/{yyyy}/{yyyy}-{mm}-{dd}_{title}.md'
};

export const CLIPPER_DEFAULTS: ClipperDefaults = Object.freeze({
  rest: {
    httpsHost: '127.0.0.1',
    httpsPort: 27124,
    httpHost: '127.0.0.1',
    httpPort: 27123,
    basePath: '',
    vaultName: 'Zendio',
    apiKey: ''
  } satisfies RestDefaults,
  templates: DEFAULT_TEMPLATES,
  fragmentClipper: DEFAULT_FRAGMENT_CLIPPER,
  llm: {
    timeoutMs: 15_000,
    retryAttempts: 3
  } satisfies LlmDefaults,
  ui: {
    notificationTimeoutMs: 5_000
  } satisfies UiDefaults
});

interface BuiltUrls {
  httpsUrl: string;
  httpUrl: string;
  baseUrl: string;
}

function buildUrl(
  protocol: 'https' | 'http',
  host: string,
  port?: number,
  basePath?: string
): string {
  const safeHost = host.replace(/\/+$/, '');
  const hostWithPort = typeof port === 'number' ? `${safeHost}:${port}` : safeHost;
  const safePath = basePath ? `/${basePath.replace(/^\/+/, '')}` : '';
  return `${protocol}://${hostWithPort}${safePath}/`;
}

export function resolveRestUrls(rest: RestDefaults = CLIPPER_DEFAULTS.rest): BuiltUrls {
  const { httpsHost, httpsPort, httpHost, httpPort, basePath } = rest;
  const httpsUrl = buildUrl('https', httpsHost, httpsPort, basePath);
  const httpUrl = buildUrl('http', httpHost, httpPort, basePath);
  const baseUrl = httpsUrl || httpUrl;
  return { httpsUrl, httpUrl, baseUrl };
}

export function getDefaultRestOptions(): {
  baseUrl: string;
  httpsUrl: string;
  httpUrl: string;
  vault: string;
  apiKey: string;
} {
  const { httpsUrl, httpUrl, baseUrl } = resolveRestUrls();
  const { vaultName, apiKey } = CLIPPER_DEFAULTS.rest;
  return {
    baseUrl,
    httpsUrl,
    httpUrl,
    vault: vaultName,
    apiKey
  };
}

export function getDefaultTemplates(): TemplateOptions {
  return {
    article: CLIPPER_DEFAULTS.templates.article,
    video: CLIPPER_DEFAULTS.templates.video,
    fragment: CLIPPER_DEFAULTS.templates.fragment,
    reading: CLIPPER_DEFAULTS.templates.reading,
    ai: CLIPPER_DEFAULTS.templates.ai
  };
}

export function getDefaultFragmentClipper(): FragmentClipperOptions {
  return {
    useFootnoteFormat: CLIPPER_DEFAULTS.fragmentClipper.useFootnoteFormat,
    captureContext: CLIPPER_DEFAULTS.fragmentClipper.captureContext,
    contextLength: CLIPPER_DEFAULTS.fragmentClipper.contextLength,
    contextMode: CLIPPER_DEFAULTS.fragmentClipper.contextMode,
    selectionModifierEnabled: CLIPPER_DEFAULTS.fragmentClipper.selectionModifierEnabled,
    selectionModifierKeys: [...CLIPPER_DEFAULTS.fragmentClipper.selectionModifierKeys],
    keyboardShortcutsEnabled: CLIPPER_DEFAULTS.fragmentClipper.keyboardShortcutsEnabled
  };
}

export function getDefaultLlm(): LlmDefaults {
  return {
    timeoutMs: CLIPPER_DEFAULTS.llm.timeoutMs,
    retryAttempts: CLIPPER_DEFAULTS.llm.retryAttempts
  };
}

export function getDefaultUi(): UiDefaults {
  return {
    notificationTimeoutMs: CLIPPER_DEFAULTS.ui.notificationTimeoutMs
  };
}
