/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      from: {},
      to: {
        circular: true
      }
    },
    {
      name: 'no-cross-layer-options-to-content',
      severity: 'warn',
      from: {
        path: '^src/options'
      },
      to: {
        path: '^src/content'
      }
    },
    {
      name: 'no-cross-layer-content-to-options',
      severity: 'warn',
      from: {
        path: '^src/content'
      },
      to: {
        path: '^src/options'
      }
    },
    {
      name: 'no-ui-foundation-feature-imports',
      severity: 'error',
      from: {
        path: '^src/ui/foundation'
      },
      to: {
        path: '^src/(background|content|options|platform|ui/(domains|hosts|patterns))'
      }
    },
    {
      name: 'no-ui-primitives-feature-imports',
      severity: 'error',
      from: {
        path: '^src/ui/primitives'
      },
      to: {
        path: '^src/(background|content|options|platform|ui/(domains|hosts|patterns))'
      }
    },
    {
      name: 'no-ui-domains-to-options-content-imports',
      severity: 'error',
      from: {
        path: '^src/ui/domains'
      },
      to: {
        path: '^src/(options|content)'
      }
    },
    {
      name: 'no-production-form-section-imports',
      severity: 'error',
      from: {
        path: '^src/(background|content|platform|shared|ui|options/(app|services|state|stitch|widgets|index\\.ts))'
      },
      to: {
        path: '^src/options/components/formSections'
      }
    },
    {
      name: 'no-production-old-options-section-imports',
      severity: 'error',
      from: {
        path: '^src/(background|content|platform|shared|ui|options/(app|services|state|stitch|widgets|index\\.ts))'
      },
      to: {
        path: '^src/options/components/sections/(AiSection|ClassifierSection|DeepResearchSection|DiagnosisSection|FragmentSection|LanguageSection|PrivacySection|ReadingSection|RestSection|RoutingSection|TemplatesSection|TransferSection|UsageDashboardSection|UsageSection|VideoSection|YamlConfigSection)\\.ts$'
      }
    },
    {
      name: 'no-production-duplicate-video-support-prompt-imports',
      severity: 'error',
      from: {
        path: '^src/(background|content|platform|shared|ui|options/(app|services|state|stitch|widgets|index\\.ts))'
      },
      to: {
        path: '^src/ui/domains/video/SupportPromptView\\.ts$'
      }
    }
  ],
  options: {
    doNotFollow: {
      path: 'node_modules'
    },
    exclude: {
      path: '^(dist|coverage|tests)(/|$)'
    },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json']
    }
  }
};
