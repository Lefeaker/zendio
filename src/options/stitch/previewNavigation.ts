import { DEFAULT_PRODUCTION_ENGLISH_MESSAGES } from './schema/i18n';
import type { NavItem } from './types';

export function message(
  key: keyof typeof DEFAULT_PRODUCTION_ENGLISH_MESSAGES,
  fallback = key
): string {
  const value = DEFAULT_PRODUCTION_ENGLISH_MESSAGES[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

export const previewNavigation = {
  brandSubtitle: message('extensionSubtitle'),
  sidebarLinks: [
    {
      id: 'onboarding',
      label: message('schemaResourceOnboardingTitle'),
      hint: message('schemaResourceOnboardingHint'),
      icon: 'rocket_launch'
    },
    {
      id: 'support',
      label: 'Support',
      hint: message('schemaResourceSupportHint'),
      icon: 'favorite'
    },
    {
      id: 'suggestions',
      label: 'Suggestions',
      hint: message('schemaResourceSuggestionsHint'),
      icon: 'lightbulb'
    },
    { id: 'contact', label: 'Contact', hint: message('schemaResourceContactHint'), icon: 'mail' },
    {
      id: 'changelog',
      label: 'Changelog',
      hint: message('schemaResourceChangelogHint'),
      icon: 'history'
    }
  ],
  surfaceLinks: [
    {
      id: 'clipper',
      label: message('schemaRuntimeClipperTitle'),
      hint: message('schemaRuntimeClipperHint'),
      icon: 'content_cut'
    },
    {
      id: 'reader',
      label: message('schemaRuntimeReaderTitle'),
      hint: message('schemaRuntimeReaderHint'),
      icon: 'auto_stories'
    },
    {
      id: 'video',
      label: message('schemaRuntimeVideoTitle'),
      hint: message('schemaRuntimeVideoHint'),
      icon: 'smart_display'
    },
    {
      id: 'video-floating-prompt',
      label: message('schemaRuntimeVideoFloatingPromptTitle'),
      hint: message('schemaRuntimeVideoFloatingPromptHint'),
      icon: 'ads_click'
    },
    {
      id: 'task-success',
      label: message('schemaRuntimeTaskSuccessTitle'),
      hint: message('schemaRuntimeTaskSuccessHint'),
      icon: 'celebration'
    }
  ],
  nav: [
    {
      id: 'overview',
      label: 'Overview',
      hint: message('schemaNavOverviewHint'),
      icon: 'dashboard'
    },
    {
      id: 'storage',
      label: 'Storage',
      hint: message('schemaNavStorageHint'),
      icon: 'storage'
    },
    {
      id: 'capture-sources',
      label: message('schemaCaptureSourcesTitle'),
      hint: message('schemaNavCaptureSourcesHint'),
      icon: 'ads_click'
    },
    {
      id: 'capture-behavior',
      label: message('schemaCaptureBehaviorTitle'),
      hint: message('schemaNavCaptureBehaviorHint'),
      icon: 'menu_book'
    },
    {
      id: 'output',
      label: message('schemaOutputTitle'),
      hint: message('schemaNavOutputHint'),
      icon: 'output'
    },
    {
      id: 'maintenance',
      label: 'Maintenance',
      hint: message('schemaNavMaintenanceHint'),
      icon: 'construction'
    }
  ]
} satisfies {
  brandSubtitle: string;
  sidebarLinks: NavItem[];
  surfaceLinks: NavItem[];
  nav: NavItem[];
};
