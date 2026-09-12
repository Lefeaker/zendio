import { DEFAULT_RUNTIME_MESSAGES } from '@i18n';
import type { Messages } from '@i18n/messages';
import type { BrowserTarget } from '../platform/interfaces/runtime';

type OnboardingConnectionGuideKeys = {
  title: keyof Messages;
  description: keyof Messages;
  details: readonly (keyof Messages)[];
};

const FIREFOX_CONNECTION_GUIDE_KEYS: OnboardingConnectionGuideKeys = {
  title: 'step1Title',
  description: 'step1Description',
  details: [
    'step1Detail1',
    'step1Detail2',
    'step1Detail3',
    'step1Detail4',
    'step1Detail5',
    'step1Detail6'
  ]
};

const CHROME_CONNECTION_GUIDE_KEYS: OnboardingConnectionGuideKeys = {
  title: 'step1ChromeTitle',
  description: 'step1ChromeDescription',
  details: [
    'step1ChromeDetail1',
    'step1ChromeDetail2',
    'step1ChromeDetail3',
    'step1ChromeDetail4',
    'step1ChromeDetail5',
    'step1ChromeDetail6'
  ]
};

function resolveRuntimeMessage(
  messages: Partial<Messages> | null | undefined,
  key: keyof Messages
): string {
  const raw = messages?.[key] ?? DEFAULT_RUNTIME_MESSAGES[key];
  return typeof raw === 'string' ? raw : '';
}

export function applyOnboardingConnectionGuideCopy(
  doc: Document,
  browserTarget: BrowserTarget,
  messages: Partial<Messages> | null | undefined
): void {
  const guideKeys =
    browserTarget === 'firefox' ? FIREFOX_CONNECTION_GUIDE_KEYS : CHROME_CONNECTION_GUIDE_KEYS;
  const title = doc.querySelector<HTMLElement>('[data-onboarding-step1-title]');
  const description = doc.querySelector<HTMLElement>('[data-onboarding-step1-description]');
  title?.replaceChildren(doc.createTextNode(resolveRuntimeMessage(messages, guideKeys.title)));
  description?.replaceChildren(
    doc.createTextNode(resolveRuntimeMessage(messages, guideKeys.description))
  );

  guideKeys.details.forEach((key, index) => {
    const item = doc.querySelector<HTMLElement>(
      `[data-onboarding-step1-detail="${String(index + 1)}"]`
    );
    item?.replaceChildren(doc.createTextNode(resolveRuntimeMessage(messages, key)));
  });
}
