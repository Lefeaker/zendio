import type { TemplateOptions } from '@shared/types/options';

export function repairTemplateOptions(
  templates: TemplateOptions,
  defaults: TemplateOptions
): TemplateOptions {
  return {
    ...templates,
    article: (templates.article || defaults.article).replace('Clippings/', 'Articles/'),
    video: templates.video || defaults.video,
    fragment: templates.fragment || defaults.fragment,
    reading: templates.reading || defaults.reading,
    ai: templates.ai || defaults.ai
  };
}
