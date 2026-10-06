/** Stable links shared by learning pages and the actual Options walkthrough. */
export const SETTINGS_GUIDE_SECTIONS = {
  overview: 'overview',
  appearance: 'overview',
  privacy: 'overview',
  vault: 'storage',
  rest: 'storage',
  routing: 'storage',
  sources: 'capture-sources',
  video: 'capture-sources',
  attachments: 'capture-sources',
  reading: 'capture-behavior',
  highlight: 'capture-behavior',
  selection: 'capture-behavior',
  context: 'capture-behavior',
  shortcuts: 'capture-behavior',
  output: 'output',
  mappings: 'output',
  yaml: 'output',
  maintenance: 'maintenance',
  diagnostics: 'maintenance',
  ai: 'maintenance'
} as const;
export type SettingsGuideStep = keyof typeof SETTINGS_GUIDE_SECTIONS;
export const SETTINGS_GUIDE_BASICS: readonly SettingsGuideStep[] = [
  'overview',
  'vault',
  'selection',
  'output'
];

export function settingsGuidePath(step: SettingsGuideStep): string {
  const route = step === 'overview' ? '&guideMode=basics' : '';
  return `options/index.html?guide=${step}${route}#section-${SETTINGS_GUIDE_SECTIONS[step]}`;
}
