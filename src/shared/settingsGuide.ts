/** Stable links shared by the learning pages and the actual Options walkthrough. */
export const SETTINGS_GUIDE_SECTIONS = {
  vault: 'storage',
  routing: 'storage',
  sources: 'capture-sources',
  reading: 'capture-behavior',
  selection: 'capture-behavior',
  output: 'output',
  overview: 'overview',
  maintenance: 'maintenance'
} as const;
export type SettingsGuideStep = keyof typeof SETTINGS_GUIDE_SECTIONS;

export function settingsGuidePath(step: SettingsGuideStep): string {
  return `options/index.html?guide=${step}#section-${SETTINGS_GUIDE_SECTIONS[step]}`;
}
