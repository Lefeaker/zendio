import type { TemplateOptions } from '../types';
import { getDefaultTemplates } from './appConfig';

export const OUTPUT_TEMPLATE_PRESET_NAMES = ['Minimal', 'Research', 'Conversation'] as const;

export type OutputTemplatePresetName = (typeof OUTPUT_TEMPLATE_PRESET_NAMES)[number];

export interface OutputTemplatePreset {
  name: OutputTemplatePresetName;
  templates: TemplateOptions;
  domainMappings: Record<string, string>;
}

export interface PreviewTemplateDefaults extends Record<string, string> {
  articleVideo: string;
  video: string;
  fragment: string;
  readingCustom: string;
  aiChat: string;
}

const DEFAULT_TEMPLATES = getDefaultTemplates();

const PREVIEW_TEMPLATE_DEFAULTS: PreviewTemplateDefaults = Object.freeze({
  articleVideo: DEFAULT_TEMPLATES.article,
  video: DEFAULT_TEMPLATES.video,
  fragment: 'Clippings/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
  readingCustom: DEFAULT_TEMPLATES.reading,
  aiChat: DEFAULT_TEMPLATES.ai
});

const OUTPUT_TEMPLATE_PRESETS: Record<OutputTemplatePresetName, OutputTemplatePreset> =
  Object.freeze({
    Minimal: Object.freeze({
      name: 'Minimal',
      templates: Object.freeze({
        article: DEFAULT_TEMPLATES.article,
        video: DEFAULT_TEMPLATES.video,
        fragment: 'Clips/{domain}/{yyyy}/{slug}.md',
        reading: 'Reading/{domain}/{yyyy}/{slug}.md',
        ai: 'AI/{platform}/{yyyy}/{title}.md'
      }),
      domainMappings: Object.freeze({})
    }),
    Research: Object.freeze({
      name: 'Research',
      templates: Object.freeze({
        article: 'Research/{domain}/{yyyy}/{slug}.md',
        video: 'Video/Research/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
        fragment: 'Research/Fragments/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
        reading: 'Research/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md',
        ai: 'Research/AI/{platform}/{yyyy}/{yyyy}-{mm}-{dd}_{title}.md'
      }),
      domainMappings: Object.freeze({
        'arxiv.org': 'Arxiv',
        'mp.weixin.qq.com': 'WeChat',
        'scholar.google.com': 'Scholar'
      })
    }),
    Conversation: Object.freeze({
      name: 'Conversation',
      templates: Object.freeze({
        article: DEFAULT_TEMPLATES.article,
        video: DEFAULT_TEMPLATES.video,
        fragment: 'Clips/{domain}/{yyyy}/{slug}.md',
        reading: 'Reading/{domain}/{yyyy}/{slug}.md',
        ai: DEFAULT_TEMPLATES.ai
      }),
      domainMappings: Object.freeze({
        'chatgpt.com': 'ChatGPT',
        'claude.ai': 'Claude',
        'gemini.google.com': 'Gemini'
      })
    })
  });

function cloneTemplates(templates: TemplateOptions): TemplateOptions {
  return {
    article: templates.article,
    video: templates.video,
    fragment: templates.fragment,
    reading: templates.reading,
    ai: templates.ai
  };
}

function cloneDomainMappings(domainMappings: Record<string, string>): Record<string, string> {
  return { ...domainMappings };
}

export function getOutputTemplatePreset(name: string): OutputTemplatePreset | null {
  const preset = OUTPUT_TEMPLATE_PRESETS[name as OutputTemplatePresetName];
  if (!preset) {
    return null;
  }

  return {
    name: preset.name,
    templates: cloneTemplates(preset.templates),
    domainMappings: cloneDomainMappings(preset.domainMappings)
  };
}

export function getPreviewTemplateDefaults(): PreviewTemplateDefaults {
  return {
    articleVideo: PREVIEW_TEMPLATE_DEFAULTS.articleVideo,
    video: PREVIEW_TEMPLATE_DEFAULTS.video,
    fragment: PREVIEW_TEMPLATE_DEFAULTS.fragment,
    readingCustom: PREVIEW_TEMPLATE_DEFAULTS.readingCustom,
    aiChat: PREVIEW_TEMPLATE_DEFAULTS.aiChat
  };
}
