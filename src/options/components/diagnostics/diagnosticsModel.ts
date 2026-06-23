import type { VaultConfig, RoutingRule } from '@shared/types';
import type {
  StoredOptions,
  ReadingSessionOptions,
  FragmentClipperOptions,
  CompleteOptions
} from '@shared/types/options';
import { collectPortEntriesFromConfig, findDuplicatePorts } from '../../utils/ports';
import { configProvider } from '@shared/config/provider';
import {
  createDiagnosticLine,
  createDiagnosticMessage,
  type DiagnosticReport,
  type DiagnosticSection
} from './diagnosticsMessages';

function isPresentOptions(
  options: StoredOptions | CompleteOptions | null | undefined
): options is StoredOptions | CompleteOptions {
  return options !== null && options !== undefined && Object.keys(options).length > 0;
}

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

export function buildDiagnosticsModel(
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
