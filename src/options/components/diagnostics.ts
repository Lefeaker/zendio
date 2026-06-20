import { DEFAULT_RUNTIME_MESSAGES, type Messages } from '@i18n';
import { formatUserVisibleMessage } from '../../i18n/userVisibleMessageFormatter';
import type {
  UserVisibleMessageDescriptor,
  UserVisibleMessageValues
} from '../../shared/i18n/userVisibleMessageDescriptor';
import { getElementById } from '../utils/dom';
import type { VaultConfig, RoutingRule } from '../../shared/types';
import type {
  StoredOptions,
  ReadingSessionOptions,
  FragmentClipperOptions,
  CompleteOptions
} from '../../shared/types/options';
import { collectPortEntriesFromConfig, findDuplicatePorts } from '../utils/ports';
import { getOptionsController } from '../app/optionsControllerContext';
import { getOptionsI18nResource, getOptionsMessages } from '../app/i18nContext';
import { configProvider } from '../../shared/config/provider';
import { resolveRepository } from '../../shared/di/serviceRegistry';
import { DI_TOKENS } from '../../shared/di/tokens';
import type { IOptionsRepository } from '../../shared/repositories';

type DiagnosticSeverity = 'ok' | 'warning' | 'error' | 'info';
type DiagnosticMessageKey = Extract<keyof Messages, string>;
type DiagnosticMessage = UserVisibleMessageDescriptor<DiagnosticMessageKey>;

interface DiagnosticLine {
  severity?: DiagnosticSeverity;
  message?: DiagnosticMessage;
  rawText?: string;
}

interface DiagnosticSection {
  icon: string;
  title: DiagnosticMessage;
  lines: DiagnosticLine[];
  rawBlock?: string;
}

interface DiagnosticReport {
  sections: DiagnosticSection[];
  footer?: DiagnosticMessage;
}

const SEVERITY_PREFIX: Record<DiagnosticSeverity, string> = {
  ok: '✅',
  warning: '⚠️',
  error: '❌',
  info: 'ℹ️'
};

const INLINE_STATUS_PREFIX = /^(✅|⚠️|❌|ℹ️)\s/u;

function isEmptyOptions(options: StoredOptions | null | undefined): boolean {
  return !options || Object.keys(options).length === 0;
}

function isPresentOptions(
  options: StoredOptions | CompleteOptions | null | undefined
): options is StoredOptions | CompleteOptions {
  return options !== null && options !== undefined && Object.keys(options).length > 0;
}

const REST_DEFAULTS = configProvider.getRestDefaults();
const TEMPLATE_DEFAULTS = configProvider.getTemplates();
const FRAGMENT_DEFAULTS = configProvider.getFragmentClipperDefaults();

const VALID_READING_EXPORT_MODES: ReadonlySet<ReadingSessionOptions['exportMode']> = new Set([
  'highlights',
  'full'
]);
const VALID_READING_THEMES: ReadonlySet<ReadingSessionOptions['highlightTheme']> = new Set([
  'gradient',
  'purple',
  'neonYellow',
  'neonGreen',
  'neonOrange'
]);

const VALID_FRAGMENT_KEYS: ReadonlySet<FragmentClipperOptions['selectionModifierKeys'][number]> =
  new Set(['alt', 'meta', 'ctrl', 'shift']);

function createDiagnosticMessage<Key extends DiagnosticMessageKey>(
  key: Key,
  values?: UserVisibleMessageValues
): UserVisibleMessageDescriptor<Key> {
  return values && Object.keys(values).length > 0 ? { key, values } : { key };
}

function createDiagnosticLine(
  severity: DiagnosticSeverity,
  key: DiagnosticMessageKey,
  values?: UserVisibleMessageValues
): DiagnosticLine {
  return {
    severity,
    message: createDiagnosticMessage(key, values)
  };
}

function resolveDiagnosticsMessages(messages?: Partial<Messages> | null): Messages {
  if (messages) {
    const mergedMessages: Messages = { ...DEFAULT_RUNTIME_MESSAGES, ...messages };
    return mergedMessages;
  }

  return getOptionsI18nResource()?.messages ?? DEFAULT_RUNTIME_MESSAGES;
}

function formatDiagnosticMessage(message: DiagnosticMessage, messages: Messages): string {
  return formatUserVisibleMessage(message, messages, DEFAULT_RUNTIME_MESSAGES[message.key] ?? '');
}

function renderDiagnosticLine(line: DiagnosticLine, messages: Messages): string {
  if (line.rawText !== undefined) {
    return line.rawText;
  }

  if (!line.message) {
    return '';
  }

  const text = formatDiagnosticMessage(line.message, messages);
  if (!line.severity || INLINE_STATUS_PREFIX.test(text)) {
    return text;
  }

  return `${SEVERITY_PREFIX[line.severity]} ${text}`;
}

function renderDiagnosticSection(section: DiagnosticSection, messages: Messages): string {
  let output = `\n${section.icon} ${formatDiagnosticMessage(section.title, messages)}:\n`;

  if (section.rawBlock !== undefined) {
    output += `${section.rawBlock}\n`;
  }

  for (const line of section.lines) {
    output += `${renderDiagnosticLine(line, messages)}\n`;
  }

  return output;
}

function renderDiagnosticReport(report: DiagnosticReport, messages: Messages): string {
  let output = '';

  for (const section of report.sections) {
    output += renderDiagnosticSection(section, messages);
  }

  if (report.footer) {
    output += `\n${formatDiagnosticMessage(report.footer, messages)}\n`;
  }

  return output;
}

function buildDiagnosticsModel(
  options: StoredOptions | CompleteOptions | null | undefined
): DiagnosticReport {
  const currentConfigSection: DiagnosticSection = {
    icon: '📋',
    title: createDiagnosticMessage('diagnosticsSectionCurrentConfigTitle'),
    lines: [],
    rawBlock: JSON.stringify(options, null, 2)
  };
  const configChecksSection: DiagnosticSection = {
    icon: '🔍',
    title: createDiagnosticMessage('diagnosticsSectionConfigChecksTitle'),
    lines: []
  };

  if (!isPresentOptions(options)) {
    configChecksSection.lines.push(createDiagnosticLine('error', 'diagnosticsConfigNotFound'));
    return {
      sections: [currentConfigSection, configChecksSection]
    };
  }

  if (!options.rest) {
    configChecksSection.lines.push(createDiagnosticLine('error', 'diagnosticsRestConfigMissing'));
  } else {
    const rest = options.rest;
    if (!rest.httpsUrl && !rest.httpUrl) {
      configChecksSection.lines.push(createDiagnosticLine('warning', 'diagnosticsRestUrlsMissing'));
    }
    if (!rest.apiKey) {
      configChecksSection.lines.push(
        createDiagnosticLine('warning', 'diagnosticsRestApiKeyMissing')
      );
    }
  }

  if (!options.templates) {
    configChecksSection.lines.push(createDiagnosticLine('warning', 'diagnosticsTemplatesMissing'));
  } else {
    const templates = options.templates;
    if (!templates.article) {
      configChecksSection.lines.push(
        createDiagnosticLine('warning', 'diagnosticsTemplateArticleMissing')
      );
    }
    if (!templates.video) {
      configChecksSection.lines.push(
        createDiagnosticLine('warning', 'diagnosticsTemplateVideoMissing')
      );
    }
    if (!templates.fragment) {
      configChecksSection.lines.push(
        createDiagnosticLine('warning', 'diagnosticsTemplateFragmentMissing')
      );
    }
    if (!templates.ai) {
      configChecksSection.lines.push(
        createDiagnosticLine('warning', 'diagnosticsTemplateAiMissing')
      );
    }
  }

  const multiVaultSection: DiagnosticSection = {
    icon: '📦',
    title: createDiagnosticMessage('diagnosticsSectionMultiVaultTitle'),
    lines: []
  };

  if (options.vaultRouter) {
    const router = options.vaultRouter;
    const activeVaults = router.vaults?.filter((vault) => vault.enabled !== false) ?? [];
    if (activeVaults.length === 0) {
      multiVaultSection.lines.push(
        createDiagnosticLine('warning', 'diagnosticsAdditionalVaultsMissing')
      );
    } else {
      multiVaultSection.lines.push(
        createDiagnosticLine('ok', 'diagnosticsActiveVaultCount', { count: activeVaults.length })
      );
    }

    const legacyRulesCount = router.rules?.length ?? 0;
    const nestedRulesCount = activeVaults.reduce(
      (total: number, vault: VaultConfig & { rules?: RoutingRule[] }) => {
        return total + (vault.rules?.length ?? 0);
      },
      0
    );
    const totalRules = legacyRulesCount + nestedRulesCount;

    if (totalRules === 0) {
      multiVaultSection.lines.push(createDiagnosticLine('info', 'diagnosticsRoutingRulesMissing'));
    } else {
      multiVaultSection.lines.push(
        createDiagnosticLine('ok', 'diagnosticsRoutingRuleCount', { count: totalRules })
      );
    }
  } else {
    multiVaultSection.lines.push(
      createDiagnosticLine('info', 'diagnosticsMultiVaultNotConfigured')
    );
  }

  const mappingCount = options.domainMappings ? Object.keys(options.domainMappings).length : 0;
  const domainMappingsSection: DiagnosticSection = {
    icon: '🌐',
    title: createDiagnosticMessage('diagnosticsSectionDomainMappingsTitle'),
    lines: [
      mappingCount > 0
        ? createDiagnosticLine('ok', 'diagnosticsDomainMappingCount', { count: mappingCount })
        : createDiagnosticLine('info', 'diagnosticsDomainMappingsMissing')
    ]
  };

  const aiChatSection: DiagnosticSection = {
    icon: '🤖',
    title: createDiagnosticMessage('diagnosticsSectionAiChatTitle'),
    lines: []
  };

  if (!options.aiChat) {
    aiChatSection.lines.push(createDiagnosticLine('info', 'diagnosticsAiChatConfigMissing'));
  } else {
    const userName = options.aiChat.userName?.trim();
    if (!userName) {
      aiChatSection.lines.push(createDiagnosticLine('warning', 'diagnosticsAiChatUserNameMissing'));
    } else {
      aiChatSection.lines.push(
        createDiagnosticLine('ok', 'diagnosticsAiChatUserNameValue', { userName })
      );
    }
  }

  const fragmentSection: DiagnosticSection = {
    icon: '✂️',
    title: createDiagnosticMessage('diagnosticsSectionFragmentClipperTitle'),
    lines: []
  };

  if (!options.fragmentClipper) {
    fragmentSection.lines.push(
      createDiagnosticLine('info', 'diagnosticsFragmentClipperConfigMissing')
    );
  } else {
    const clipper = options.fragmentClipper;
    fragmentSection.lines.push(
      clipper.useFootnoteFormat
        ? createDiagnosticLine('ok', 'diagnosticsFragmentFootnoteEnabled')
        : createDiagnosticLine('info', 'diagnosticsFragmentFootnoteDisabled')
    );
    fragmentSection.lines.push(
      clipper.captureContext
        ? createDiagnosticLine('ok', 'diagnosticsFragmentContextEnabled')
        : createDiagnosticLine('info', 'diagnosticsFragmentContextDisabled')
    );

    const contextLength = Number(clipper.contextLength ?? FRAGMENT_DEFAULTS.contextLength);
    if (!Number.isFinite(contextLength) || contextLength <= 0) {
      fragmentSection.lines.push(
        createDiagnosticLine('error', 'diagnosticsFragmentContextLengthInvalid')
      );
    } else if (contextLength < 50) {
      fragmentSection.lines.push(
        createDiagnosticLine('warning', 'diagnosticsFragmentContextLengthShort', {
          value: contextLength
        })
      );
    } else {
      fragmentSection.lines.push(
        createDiagnosticLine('ok', 'diagnosticsFragmentContextLengthValue', {
          value: contextLength
        })
      );
    }

    if (clipper.selectionModifierEnabled) {
      const keys = (clipper.selectionModifierKeys ?? []).filter((key) =>
        VALID_FRAGMENT_KEYS.has(key)
      );
      if (keys.length === 0) {
        fragmentSection.lines.push(
          createDiagnosticLine('warning', 'diagnosticsFragmentModifierKeysMissing')
        );
      } else {
        fragmentSection.lines.push(
          createDiagnosticLine('ok', 'diagnosticsFragmentModifierKeysValue', {
            keys: keys.join(' + ')
          })
        );
      }
    } else {
      fragmentSection.lines.push(
        createDiagnosticLine('info', 'diagnosticsFragmentModifierDisabled')
      );
    }
  }

  const readingSection: DiagnosticSection = {
    icon: '📖',
    title: createDiagnosticMessage('diagnosticsSectionReadingModeTitle'),
    lines: []
  };

  if (!options.readingSession) {
    readingSection.lines.push(createDiagnosticLine('info', 'diagnosticsReadingConfigMissing'));
  } else {
    const exportMode = options.readingSession.exportMode ?? 'highlights';
    if (!VALID_READING_EXPORT_MODES.has(exportMode as ReadingSessionOptions['exportMode'])) {
      readingSection.lines.push(
        createDiagnosticLine('error', 'diagnosticsReadingUnknownExportMode', {
          mode: String(exportMode)
        })
      );
    } else {
      readingSection.lines.push(
        exportMode === 'full'
          ? createDiagnosticLine('ok', 'diagnosticsReadingExportFull')
          : createDiagnosticLine('info', 'diagnosticsReadingExportHighlights')
      );
    }

    const theme = options.readingSession.highlightTheme ?? 'gradient';
    if (!VALID_READING_THEMES.has(theme as ReadingSessionOptions['highlightTheme'])) {
      readingSection.lines.push(
        createDiagnosticLine('warning', 'diagnosticsReadingUnknownTheme', {
          theme: String(theme)
        })
      );
    } else {
      readingSection.lines.push(
        createDiagnosticLine('ok', 'diagnosticsReadingThemeValue', { theme: String(theme) })
      );
    }
  }

  const videoSection: DiagnosticSection = {
    icon: '🎬',
    title: createDiagnosticMessage('diagnosticsSectionVideoModeTitle'),
    lines: []
  };

  if (!options.video) {
    videoSection.lines.push(createDiagnosticLine('info', 'diagnosticsVideoConfigMissing'));
  } else {
    videoSection.lines.push(
      options.video.floatingPromptEnabled
        ? createDiagnosticLine('ok', 'diagnosticsVideoFloatingPromptEnabled')
        : createDiagnosticLine('info', 'diagnosticsVideoFloatingPromptDisabled')
    );
  }

  const portSection: DiagnosticSection = {
    icon: '🔌',
    title: createDiagnosticMessage('diagnosticsSectionPortChecksTitle'),
    lines: []
  };

  const portEntries = collectPortEntriesFromConfig(options.rest, options.vaultRouter?.vaults);
  const portConflicts = findDuplicatePorts(portEntries);
  if (portConflicts.length > 0) {
    portSection.lines.push({
      severity: 'warning',
      message: createDiagnosticMessage('portConflictDetected', {
        ports: portConflicts.join(', ')
      })
    });
  } else {
    portSection.lines.push(createDiagnosticLine('ok', 'diagnosticsPortConfigHealthy'));
  }

  return {
    sections: [
      currentConfigSection,
      configChecksSection,
      multiVaultSection,
      domainMappingsSection,
      aiChatSection,
      fragmentSection,
      readingSection,
      videoSection,
      portSection
    ],
    footer: createDiagnosticMessage('diagnosticsCompleted')
  };
}

async function resolveOptionsSnapshot(): Promise<StoredOptions | null> {
  const controller = getOptionsController();
  if (controller) {
    const snapshot = controller.getSnapshot();
    if (snapshot && !isEmptyOptions(snapshot)) {
      return snapshot;
    }
    return controller.loadRaw();
  }
  try {
    const optionsRepository = resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
    return (await optionsRepository.get()) as StoredOptions;
  } catch (error) {
    console.error('[diagnostics] Failed to load options:', error);
    return null;
  }
}

async function resolveCurrentMessages(): Promise<Messages> {
  try {
    return resolveDiagnosticsMessages(await getOptionsMessages());
  } catch {
    return resolveDiagnosticsMessages();
  }
}

export async function runDiagnostics(): Promise<void> {
  const diagSection = getElementById<HTMLElement>('diagSection');
  const diagOutput = getElementById<HTMLPreElement>('diagOutput');
  const messages = await resolveCurrentMessages();

  diagSection.style.display = 'block';
  diagOutput.textContent = `${formatDiagnosticMessage(
    createDiagnosticMessage('diagnosticsRunning'),
    messages
  )}\n`;

  try {
    const options = await resolveOptionsSnapshot();
    diagOutput.textContent += buildDiagnosticsReport(options, messages);
  } catch (error) {
    diagOutput.textContent += `\n${renderDiagnosticLine(
      {
        severity: 'error',
        message: createDiagnosticMessage('diagnosticsRunFailed', {
          reason: error instanceof Error ? error.message : String(error)
        })
      },
      messages
    )}\n`;
  }
}

export function buildDiagnosticsReport(
  options: StoredOptions | CompleteOptions | null | undefined,
  messages?: Partial<Messages> | null
): string {
  return renderDiagnosticReport(
    buildDiagnosticsModel(options),
    resolveDiagnosticsMessages(messages)
  );
}

export async function fixConfiguration(onAfterFix?: () => Promise<void> | void): Promise<void> {
  const diagOutput = getElementById<HTMLPreElement>('diagOutput');
  const messages = await resolveCurrentMessages();

  try {
    const options = await resolveOptionsSnapshot();

    if (isEmptyOptions(options) || !options?.rest) {
      diagOutput.textContent += `\n${renderDiagnosticLine(
        createDiagnosticLine('error', 'diagnosticsRepairUnavailableNoConfig'),
        messages
      )}\n`;
      return;
    }

    diagOutput.textContent += `\n${renderDiagnosticLine(
      createDiagnosticLine('info', 'diagnosticsRepairing'),
      messages
    )}\n`;

    let baseUrl = options.rest.httpsUrl || options.rest.baseUrl || REST_DEFAULTS.baseUrl;

    if (baseUrl.startsWith('http://') && baseUrl.includes(`:${REST_DEFAULTS.httpsPort}`)) {
      baseUrl = baseUrl.replace('http://', 'https://');
      diagOutput.textContent += `${renderDiagnosticLine(
        createDiagnosticLine('ok', 'diagnosticsRepairSwitchedToHttps', {
          port: REST_DEFAULTS.httpsPort
        }),
        messages
      )}\n`;
    } else if (baseUrl.startsWith('https://') && baseUrl.includes(`:${REST_DEFAULTS.httpPort}`)) {
      baseUrl = baseUrl.replace('https://', 'http://');
      diagOutput.textContent += `${renderDiagnosticLine(
        createDiagnosticLine('ok', 'diagnosticsRepairSwitchedToHttp', {
          port: REST_DEFAULTS.httpPort
        }),
        messages
      )}\n`;
    }

    const templates = options.templates || {};

    if (!templates.fragment) {
      templates.fragment = TEMPLATE_DEFAULTS.fragment;
      diagOutput.textContent += `${renderDiagnosticLine(
        createDiagnosticLine('ok', 'diagnosticsRepairAddedFragmentTemplate'),
        messages
      )}\n`;
    }

    if (!templates.video) {
      templates.video = TEMPLATE_DEFAULTS.video;
      diagOutput.textContent += `${renderDiagnosticLine(
        createDiagnosticLine('ok', 'diagnosticsRepairAddedVideoTemplate'),
        messages
      )}\n`;
    }

    if (templates.article && templates.article.includes('Clippings/')) {
      templates.article = templates.article.replace('Clippings/', 'Articles/');
      diagOutput.textContent += `${renderDiagnosticLine(
        createDiagnosticLine('ok', 'diagnosticsRepairUpdatedArticleTemplate'),
        messages
      )}\n`;
    }

    const newOptions = {
      ...options,
      rest: {
        ...options.rest,
        httpsUrl: options.rest.httpsUrl || REST_DEFAULTS.httpsUrl,
        httpUrl: options.rest.httpUrl || REST_DEFAULTS.httpUrl,
        baseUrl
      },
      templates: {
        article: templates.article || TEMPLATE_DEFAULTS.article,
        video: templates.video || TEMPLATE_DEFAULTS.video,
        fragment: templates.fragment || TEMPLATE_DEFAULTS.fragment,
        reading: templates.reading || TEMPLATE_DEFAULTS.reading,
        ai: templates.ai || TEMPLATE_DEFAULTS.ai
      }
    };

    const controller = getOptionsController();
    if (controller) {
      await controller.saveSnapshot({ reason: 'manual', draft: newOptions });
    } else {
      const optionsRepository = resolveRepository<IOptionsRepository>(DI_TOKENS.IOptionsRepository);
      await optionsRepository.set(newOptions as CompleteOptions);
    }
    diagOutput.textContent += `${renderDiagnosticLine(
      createDiagnosticLine('ok', 'diagnosticsRepairSaved'),
      messages
    )}\n`;
    diagOutput.textContent += `\n${formatDiagnosticMessage(
      createDiagnosticMessage('diagnosticsRepairReloadHint'),
      messages
    )}\n`;

    if (onAfterFix) {
      window.setTimeout(() => {
        void (async () => {
          await onAfterFix();
          await runDiagnostics();
        })();
      }, 1000);
    }
  } catch (error) {
    diagOutput.textContent += `\n${renderDiagnosticLine(
      {
        severity: 'error',
        message: createDiagnosticMessage('diagnosticsRepairFailed', {
          reason: error instanceof Error ? error.message : String(error)
        })
      },
      messages
    )}\n`;
  }
}
