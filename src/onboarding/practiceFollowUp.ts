import type { Messages } from '../i18n/messages';
import type { PracticeLesson } from './practiceLessonTypes';
import { settingsGuidePath, type SettingsGuideStep } from '../shared/settingsGuide';

export function settingsGuideLink(label: string, step: SettingsGuideStep): HTMLAnchorElement {
  const link = document.createElement('a');
  link.textContent = label;
  link.href = '../' + settingsGuidePath(step);
  link.target = '_blank';
  link.rel = 'noopener';
  link.dataset.settingsGuide = step;
  return link;
}

export function selectionSettingsHint(m: Messages): HTMLParagraphElement {
  const p = document.createElement('p');
  p.className = 'practice-settings-link';
  p.append(
    m.settingsSelectionHint
      .replace('{section}', m.schemaCaptureBehaviorTitle)
      .replace('{control}', m.fragmentSelectionTriggerModeLabel) + ' ',
    settingsGuideLink(m.fragmentSelectionTriggerModeLabel, 'selection')
  );
  return p;
}

export function practiceFollowUp(m: Messages, lesson: PracticeLesson, firefox: boolean) {
  const root = document.createElement('section');
  root.className = 'practice-follow-up';
  const paragraph = (text: string) => {
    const p = document.createElement('p');
    p.textContent = text;
    root.append(p);
  };
  if (lesson === 'reader') {
    paragraph(m.schemaCaptureBehaviorSidebarHighlightsNote);
    root.append(settingsGuideLink(m.readingConfigTitle, 'reading'));
  } else if (lesson === 'video') {
    paragraph(m.settingsAfterVideo);
    paragraph(firefox ? m.settingsVaultFirefox : m.settingsVaultLocal);
    for (const [label, step] of [
      [m.settingsConnectVault, 'vault'],
      [m.settingsTourTitle, 'overview'],
      [m.aiConfigTitle, 'ai']
    ] as const) {
      const link = settingsGuideLink(label, step);
      link.className = 'btn ' + (step === 'vault' ? 'primary' : 'secondary');
      root.append(link);
    }
    paragraph(
      m.schemaCaptureSourcesAttachmentGuidancePrefix +
        m.schemaCaptureSourcesAttachmentGuidanceLink +
        m.schemaCaptureSourcesAttachmentGuidanceSuffix
    );
    root.append(settingsGuideLink(m.schemaCaptureSourcesScreenshotLocationTitle, 'sources'));
  }
  return root;
}
