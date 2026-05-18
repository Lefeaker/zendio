import type { FragmentClipperOptions, TemplateOptions } from '../types';
import {
  CLIPPER_DEFAULTS,
  type ClipperDefaults,
  type LlmDefaults,
  type RestDefaults,
  type UiDefaults,
  getDefaultFragmentClipper,
  getDefaultLlm,
  getDefaultTemplates,
  getDefaultUi,
  resolveRestUrls
} from './appConfig';

export interface ConfigOverrides {
  rest?: Partial<RestDefaults>;
  templates?: Partial<TemplateOptions>;
  fragmentClipper?: Partial<FragmentClipperOptions>;
  llm?: Partial<LlmDefaults>;
  ui?: Partial<UiDefaults>;
}

export interface ResolvedRestDefaults {
  baseUrl: string;
  httpsUrl: string;
  httpUrl: string;
  httpsHost: string;
  httpsPort?: number;
  httpHost: string;
  httpPort?: number;
  basePath?: string;
  vault: string;
  apiKey: string;
}

export interface ConfigProvider {
  getDefaults(): ClipperDefaults;
  getRestDefaults(): ResolvedRestDefaults;
  getTemplates(): TemplateOptions;
  getFragmentClipperDefaults(): FragmentClipperOptions;
  getLlmDefaults(): LlmDefaults;
  getUiDefaults(): UiDefaults;
}

interface ProviderState {
  rest: RestDefaults;
  templates: TemplateOptions;
  fragmentClipper: FragmentClipperOptions;
  llm: LlmDefaults;
  ui: UiDefaults;
}

function mergeRestDefaults(
  defaults: RestDefaults,
  overrides?: Partial<RestDefaults>
): RestDefaults {
  if (!overrides) {
    return { ...defaults };
  }

  const result: RestDefaults = {
    httpsHost: overrides.httpsHost ?? defaults.httpsHost,
    httpHost: overrides.httpHost ?? defaults.httpHost,
    vaultName: overrides.vaultName ?? defaults.vaultName,
    apiKey: overrides.apiKey ?? defaults.apiKey
  };

  if (overrides.httpsPort !== undefined || defaults.httpsPort !== undefined) {
    const resolvedHttpsPort = overrides.httpsPort ?? defaults.httpsPort;
    if (resolvedHttpsPort !== undefined) {
      result.httpsPort = resolvedHttpsPort;
    }
  }
  if (overrides.httpPort !== undefined || defaults.httpPort !== undefined) {
    const resolvedHttpPort = overrides.httpPort ?? defaults.httpPort;
    if (resolvedHttpPort !== undefined) {
      result.httpPort = resolvedHttpPort;
    }
  }
  if (overrides.basePath !== undefined || defaults.basePath !== undefined) {
    const resolvedBasePath = overrides.basePath ?? defaults.basePath;
    if (resolvedBasePath !== undefined) {
      result.basePath = resolvedBasePath;
    }
  }

  return result;
}

function mergeTemplates(
  defaults: TemplateOptions,
  overrides?: Partial<TemplateOptions>
): TemplateOptions {
  if (!overrides) {
    return { ...defaults };
  }
  return {
    article: overrides.article ?? defaults.article,
    fragment: overrides.fragment ?? defaults.fragment,
    reading: overrides.reading ?? defaults.reading,
    ai: overrides.ai ?? defaults.ai
  };
}

function mergeFragmentClipper(
  defaults: FragmentClipperOptions,
  overrides?: Partial<FragmentClipperOptions>
): FragmentClipperOptions {
  if (!overrides) {
    return {
      ...defaults,
      selectionModifierKeys: [...defaults.selectionModifierKeys]
    };
  }
  return {
    useFootnoteFormat: overrides.useFootnoteFormat ?? defaults.useFootnoteFormat,
    captureContext: overrides.captureContext ?? defaults.captureContext,
    contextLength: overrides.contextLength ?? defaults.contextLength,
    contextMode: overrides.contextMode ?? defaults.contextMode,
    selectionModifierEnabled:
      overrides.selectionModifierEnabled ?? defaults.selectionModifierEnabled,
    selectionModifierKeys: overrides.selectionModifierKeys
      ? [...overrides.selectionModifierKeys]
      : [...defaults.selectionModifierKeys],
    keyboardShortcutsEnabled:
      overrides.keyboardShortcutsEnabled ?? defaults.keyboardShortcutsEnabled
  };
}

function mergeLlm(defaults: LlmDefaults, overrides?: Partial<LlmDefaults>): LlmDefaults {
  if (!overrides) {
    return { ...defaults };
  }
  return {
    timeoutMs: overrides.timeoutMs ?? defaults.timeoutMs,
    retryAttempts: overrides.retryAttempts ?? defaults.retryAttempts
  };
}

function mergeUi(defaults: UiDefaults, overrides?: Partial<UiDefaults>): UiDefaults {
  if (!overrides) {
    return { ...defaults };
  }
  return {
    notificationTimeoutMs: overrides.notificationTimeoutMs ?? defaults.notificationTimeoutMs
  };
}

function cloneState(state: ProviderState): ProviderState {
  return {
    rest: { ...state.rest },
    templates: { ...state.templates },
    fragmentClipper: {
      ...state.fragmentClipper,
      selectionModifierKeys: [...state.fragmentClipper.selectionModifierKeys]
    },
    llm: { ...state.llm },
    ui: { ...state.ui }
  };
}

function resolveProviderState(
  defaults: ClipperDefaults,
  overrides?: ConfigOverrides
): ProviderState {
  return {
    rest: mergeRestDefaults(defaults.rest, overrides?.rest),
    templates: mergeTemplates(defaults.templates, overrides?.templates),
    fragmentClipper: mergeFragmentClipper(defaults.fragmentClipper, overrides?.fragmentClipper),
    llm: mergeLlm(defaults.llm, overrides?.llm),
    ui: mergeUi(defaults.ui, overrides?.ui)
  };
}

function buildRestDefaults(rest: RestDefaults): ResolvedRestDefaults {
  const urls = resolveRestUrls(rest);
  const result: ResolvedRestDefaults = {
    baseUrl: urls.baseUrl,
    httpsUrl: urls.httpsUrl,
    httpUrl: urls.httpUrl,
    httpsHost: rest.httpsHost,
    httpHost: rest.httpHost,
    vault: rest.vaultName,
    apiKey: rest.apiKey
  };

  if (rest.httpsPort !== undefined) {
    result.httpsPort = rest.httpsPort;
  }
  if (rest.httpPort !== undefined) {
    result.httpPort = rest.httpPort;
  }
  if (rest.basePath !== undefined) {
    result.basePath = rest.basePath;
  }

  return result;
}

export function createConfigProvider(input: {
  defaults: ClipperDefaults;
  overrides?: ConfigOverrides;
}): ConfigProvider {
  const state = resolveProviderState(input.defaults, input.overrides);

  return {
    getDefaults(): ClipperDefaults {
      const snapshot = cloneState(state);
      return {
        rest: snapshot.rest,
        templates: snapshot.templates,
        fragmentClipper: snapshot.fragmentClipper,
        llm: snapshot.llm,
        ui: snapshot.ui
      };
    },

    getRestDefaults(): ResolvedRestDefaults {
      return buildRestDefaults(state.rest);
    },

    getTemplates(): TemplateOptions {
      return { ...state.templates };
    },

    getFragmentClipperDefaults(): FragmentClipperOptions {
      return {
        ...state.fragmentClipper,
        selectionModifierKeys: [...state.fragmentClipper.selectionModifierKeys]
      };
    },

    getLlmDefaults(): LlmDefaults {
      return { ...state.llm };
    },

    getUiDefaults(): UiDefaults {
      return { ...state.ui };
    }
  };
}

function parsePort(value: string | undefined): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

interface GlobalEnvSource {
  process?: {
    env?: Record<string, string | undefined>;
  };
}

function resolveProcessEnv(): Record<string, string | undefined> | undefined {
  const globalEnv = globalThis as GlobalEnvSource;
  return globalEnv.process?.env;
}

export function loadOverrideFromEnv(): ConfigOverrides | undefined {
  const env = resolveProcessEnv();

  if (!env) {
    return undefined;
  }

  const restOverride: Partial<RestDefaults> = {};

  if (env.AIIINOB_REST_HTTPS_HOST) {
    restOverride.httpsHost = env.AIIINOB_REST_HTTPS_HOST;
  }
  const httpsPort = parsePort(env.AIIINOB_REST_HTTPS_PORT);
  if (typeof httpsPort === 'number') {
    restOverride.httpsPort = httpsPort;
  }
  if (env.AIIINOB_REST_HTTP_HOST) {
    restOverride.httpHost = env.AIIINOB_REST_HTTP_HOST;
  }
  const httpPort = parsePort(env.AIIINOB_REST_HTTP_PORT);
  if (typeof httpPort === 'number') {
    restOverride.httpPort = httpPort;
  }
  if (env.AIIINOB_REST_BASE_PATH) {
    restOverride.basePath = env.AIIINOB_REST_BASE_PATH;
  }
  if (env.AIIINOB_REST_VAULT_NAME) {
    restOverride.vaultName = env.AIIINOB_REST_VAULT_NAME;
  }
  if (env.AIIINOB_REST_API_KEY) {
    restOverride.apiKey = env.AIIINOB_REST_API_KEY;
  }

  const overrides: ConfigOverrides = {};
  if (Object.keys(restOverride).length > 0) {
    overrides.rest = restOverride;
  }

  return Object.keys(overrides).length > 0 ? overrides : undefined;
}

const defaultOverrides = loadOverrideFromEnv();

const configInput: {
  defaults: ClipperDefaults;
  overrides?: ConfigOverrides;
} = {
  defaults: {
    rest: { ...CLIPPER_DEFAULTS.rest },
    templates: getDefaultTemplates(),
    fragmentClipper: getDefaultFragmentClipper(),
    llm: getDefaultLlm(),
    ui: getDefaultUi()
  }
};

if (defaultOverrides !== undefined) {
  configInput.overrides = defaultOverrides;
}

export const configProvider = createConfigProvider(configInput);

export default configProvider;
