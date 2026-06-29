import type { PreviewContent } from './types';
import { message } from './previewNavigation';
import { getAIChatProductSurfacePlatforms } from '@third-party/ai-chat-exporter/platformProductSurface';
import {
  overviewContent,
  previewBrand,
  previewLanguageOptions,
  previewNav,
  previewRendererLabels,
  previewSidebarLinks,
  previewSurfaceLinks,
  privacyCollectedContent,
  privacyExcludedContent
} from './content/overviewContent';
import { resourcesContent } from './content/resourcesContent';
import { runtimeSurfacesContent } from './content/runtimeSurfaceContent';
import { outputContent, storageContent } from './content/yamlContent';

const AI_CHAT_PRODUCT_SURFACE_PLATFORMS = getAIChatProductSurfacePlatforms();
export const previewContent: PreviewContent = {
  brand: previewBrand,
  rendererLabels: previewRendererLabels,
  sidebarLinks: previewSidebarLinks,
  surfaceLinks: previewSurfaceLinks,
  nav: previewNav,
  overview: overviewContent,
  languageOptions: previewLanguageOptions,
  privacyCollected: privacyCollectedContent,
  privacyExcluded: privacyExcludedContent,
  storage: storageContent,
  captureSources: {
    hero: {
      title: message('schemaCaptureSourcesTitle'),
      description: 'Configure source-based capture capabilities for AI and video.',
      pills: ['AI Chat', 'Video'],
      icon: 'ads_click'
    },
    aiPlatforms: AI_CHAT_PRODUCT_SURFACE_PLATFORMS.map((platform) => platform.label)
  },
  captureBehavior: {
    hero: {
      title: message('schemaCaptureBehaviorTitle'),
      description: message('schemaCaptureBehaviorHeroDescription'),
      pills: ['Reading Session', 'Fragment Clipper'],
      icon: 'menu_book'
    }
  },
  output: outputContent,
  experimental: {
    hero: {
      title: 'Experimental',
      description: message('schemaExperimentalHeroDescription'),
      pills: [
        'Shared AI Service',
        'Page Summary',
        'Reading Overlay Summary',
        'Subtitle Translation'
      ],
      icon: 'science'
    },
    providerOptions: [
      { value: 'openai', label: 'OpenAI' },
      {
        value: 'compatible',
        label: message('schemaExperimentalProviderCompatibleOption')
      },
      { value: 'siliconflow', label: 'SiliconFlow' },
      { value: 'ollama', label: 'Ollama' }
    ],
    aiDefaults: {
      provider: 'compatible',
      model: 'gpt-4.1-mini',
      apiUrl: 'https://api.openai.com/v1/chat/completions',
      apiKey: ''
    },
    subtitleLanguages: [
      {
        value: 'zh-CN',
        label: message('schemaOverviewLanguageOptionZhCn')
      },
      { value: 'en', label: 'English' },
      { value: 'ja', label: 'Japanese' },
      { value: 'ko', label: 'Korean' },
      { value: 'de', label: 'German' },
      { value: 'es', label: 'Spanish' }
    ]
  },
  resources: resourcesContent,
  surfaces: runtimeSurfacesContent,
  maintenanceLog: `Diagnosis Results\n========\n✅ Default vault HTTPS connection is healthy\n✅ At least one additional vault is enabled\n✅ Routing rule priorities do not conflict\n✅ article / clipper / video / ai_chat YAML configuration all parses successfully\n⚠️ fragment.contextLength = 200 is reasonable, but monitor performance in heavier Reader Mode sessions\nℹ️ AI page summaries, Reader Mode top summaries, and subtitle translation are still planned and were not included in this connectivity check\nℹ️ video.floatingPromptEnabled controls whether the note button appears in the video-site control bar`
};
