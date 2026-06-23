import { configProvider } from '@shared/config';
import { ZENDIO_RESOURCE_LINKS } from '@shared/links/zendioResourceLinks';
import { changelogResource } from '../changelogResourceData';
import { message } from '../previewNavigation';
import type { PreviewContent } from '../types';

const REST_DEFAULTS = configProvider.getRestDefaults();

export const resourcesContent: PreviewContent['resources'] = {
  privacyPolicy: {
    hero: {
      title: message('schemaResourcePrivacyPolicyTitle'),
      description: message('schemaResourcePrivacyPolicyDescription'),
      pills: ['Local-first', 'GA4 opt-in', 'No content analytics'],
      icon: 'privacy_tip'
    },
    sections: [
      {
        title: message('errorReportingNotCollectedTitle'),
        body: message('schemaResourcePrivacyPolicyDescription'),
        bullets: [
          'Page content, clipped text, reading notes, and video note text',
          'Full URLs, query strings, Vault names, file names, and local paths',
          'Screenshot bytes, data URLs, cache keys, passwords, tokens, and cookies',
          'Personal identity information'
        ]
      },
      {
        title: message('analyticsConsentTitle'),
        body: message('schemaResourceDataUsageAnonymousUsageBody')
      },
      {
        title: message('schemaResourcePrivacyLocalConfigTitle'),
        body: message('schemaResourcePrivacyLocalConfigBody')
      }
    ]
  },
  dataUsage: {
    hero: {
      title: message('schemaResourceDataUsageTitle'),
      description: message('schemaResourceDataUsageDescription'),
      pills: ['Usage dashboard', 'Diagnostics', 'Transfer'],
      icon: 'analytics'
    },
    sections: [
      {
        title: message('schemaResourceDataUsageAnonymousUsageTitle'),
        body: message('schemaResourceDataUsageAnonymousUsageBody')
      },
      {
        title: message('errorReportingConsentTitle'),
        body: message('errorReportingConsentDescription')
      },
      {
        title: message('schemaResourceDataUsageConfigMigrationTitle'),
        body: message('schemaResourceDataUsageConfigMigrationBody')
      }
    ]
  },
  onboarding: {
    hero: {
      title: message('schemaResourceOnboardingTitle'),
      description: message('schemaResourceOnboardingDescription'),
      pills: [
        message('apiConfigTitle'),
        message('schemaStorageVaultListTitle'),
        message('schemaStorageRoutingGroupTitle'),
        message('schemaOutputYamlGroupTitle')
      ],
      icon: 'rocket_launch'
    },
    steps: [
      {
        number: '1',
        title: message('step1Title'),
        description: message('step1Description'),
        bullets: [
          'Install and enable the Local REST API plugin in Obsidian',
          'Turn on Enable Non-encrypted (HTTP) Server',
          `Record the HTTPS URL, usually ${REST_DEFAULTS.httpsUrl}`,
          `Record the HTTP URL, usually ${REST_DEFAULTS.httpUrl}`,
          'Record the vault name and copy the API key'
        ]
      },
      {
        number: '2',
        title: message('step2Title'),
        description: message('step2Description'),
        bullets: [
          'Additional vaults use the same HTTPS / HTTP / API key setup as the default vault',
          'Route rules can match by domain, keyword, or URL pattern',
          'Content that matches no rule falls back to the default vault'
        ]
      },
      {
        number: '3',
        title: message('step3Title'),
        description: message('step3Description'),
        bullets: [
          'Click blank space on a webpage to save the full page',
          'Auto-detect and export content from mainstream AI chat platforms',
          'Reader Mode batches note-taking across highlights and saves full-page highlights',
          'Video Mode supports timestamp notes, captured comments, and jump-back links'
        ]
      },
      {
        number: '4',
        title: message('step4Title'),
        description: message('step4Description'),
        bullets: [
          'Copy configuration between browsers on the same device',
          'Map domains to friendlier folder names',
          'Customize path templates',
          'Use built-in diagnostics to troubleshoot configuration issues'
        ]
      },
      {
        number: '5',
        title: message('step5Title'),
        description: message('step5Description'),
        bullets: [
          'More AI capabilities will continue to land over time',
          'The long-term goal is a two-way workflow between the browser and Obsidian',
          'Suggestion, support, and contact entry points remain available in Settings'
        ]
      }
    ]
  },
  pluginSetup: {
    hero: {
      title: message('schemaResourcePluginSetupTitle'),
      description: message('schemaResourcePluginSetupDescription'),
      pills: ['Obsidian Plugin', 'Dual URL', 'Vault Name', 'Connection Test'],
      icon: 'extension'
    },
    ports: [
      ['HTTPS URL', REST_DEFAULTS.httpsUrl],
      ['HTTP URL', REST_DEFAULTS.httpUrl],
      ['Vault', 'your-vault-name'],
      ['API Key', 'your-api-key']
    ],
    steps: [
      {
        title: message('schemaResourcePluginSetupStep1'),
        body: ''
      },
      {
        title: message('schemaResourcePluginSetupStep2'),
        body: ''
      },
      {
        title: message('schemaResourcePluginSetupStep3'),
        body: ''
      },
      {
        title: message('schemaResourcePluginSetupStep4'),
        body: ''
      }
    ],
    checks: [
      'Obsidian is running and Local REST API is enabled',
      'The HTTP / HTTPS addresses match the Obsidian settings',
      'The vault name is spelled correctly',
      'The API key was copied completely with no extra spaces',
      'The Storage page connection test returns success'
    ]
  },
  support: {
    hero: {
      title: 'Support',
      description: message('schemaResourceSupportDescription'),
      pills: ['Ko-fi', message('schemaResourceSupportAfdianTitle')],
      icon: 'favorite'
    },
    channels: [
      {
        title: 'Ko-fi',
        subtitle: message('schemaResourceSupportKoFiDescription'),
        icon: './icons/ko-fi.svg',
        href: ZENDIO_RESOURCE_LINKS.koFi
      },
      {
        title: message('schemaResourceSupportAfdianTitle'),
        subtitle: message('schemaResourceSupportAfdianDescription'),
        icon: './icons/wechat-reward.svg',
        image: './icons/wechat-reward-qr.jpg'
      }
    ]
  },
  suggestions: {
    hero: {
      title: 'Suggestions',
      description: message('schemaResourceSuggestionsDescription'),
      pills: ['GitHub Issue', 'Reddit'],
      icon: 'lightbulb'
    },
    channels: [
      {
        title: message('schemaResourceSuggestionsGithubTitle'),
        subtitle: message('schemaResourceSuggestionsGithubDescription'),
        icon: './icons/github-fill.svg',
        href: ZENDIO_RESOURCE_LINKS.githubIssuesNew
      },
      {
        title: message('schemaResourceSuggestionsRedditTitle'),
        subtitle: message('schemaResourceSuggestionsRedditDescription'),
        icon: './icons/reddit.svg',
        href: ZENDIO_RESOURCE_LINKS.redditAuthor
      }
    ]
  },
  contact: {
    hero: {
      title: 'Contact',
      description: message('schemaResourceContactHint'),
      pills: ['Website', 'Reddit', 'Email'],
      icon: 'mail'
    },
    entries: [
      {
        title: 'Reddit',
        subtitle: message('schemaResourceContactRedditDescription'),
        href: ZENDIO_RESOURCE_LINKS.redditAuthor
      },
      {
        title: message('schemaResourceContactGithubTitle'),
        subtitle: message('schemaResourceContactGithubDescription'),
        href: ZENDIO_RESOURCE_LINKS.githubProfile
      },
      {
        title: message('schemaResourceContactEmailTitle'),
        subtitle: message('schemaResourceContactEmailDescription'),
        href: ZENDIO_RESOURCE_LINKS.supportEmail
      }
    ],
    note: 'If you like the product or want to talk with the author, use the website, social channels, GitHub, or email.'
  },
  changelog: changelogResource
};
