import type { Messages } from '@i18n';
import { UiButton } from '../../primitives/button';
import { UiCheckbox } from '../../primitives/checkbox';
import {
  createOptionsActionRow,
  createOptionsHintText,
  createOptionsMessageList,
  createOptionsPanel,
  createOptionsSettingRow
} from '../../primitives/layout';
import { buildPrivacyFooterLinks, buildPrivacyStatusMessage } from './privacySettingsFooter';

export interface PrivacyLayoutBindings {
  analyticsCheckbox?: HTMLInputElement | null;
  errorReportingCheckbox?: HTMLInputElement | null;
  debugModeToggle?: HTMLInputElement | null;
  debugModeHint?: HTMLElement | null;
  statusMessage?: HTMLElement | null;
}

export interface PrivacyLayoutOptions {
  showDebugToggle: boolean;
  createElement: typeof document.createElement;
  applyI18nText: (element: HTMLElement, key: keyof Messages) => void;
}

export function buildPrivacySettingsLayout(options: PrivacyLayoutOptions): {
  nodes: HTMLElement[];
  bindings: PrivacyLayoutBindings;
} {
  const bindings: PrivacyLayoutBindings = {};
  const nodes: HTMLElement[] = [];
  nodes.push(buildConsentGrid(options, bindings), buildConsentHints(options));

  if (options.showDebugToggle) {
    nodes.push(buildDebugSection(options, bindings));
  }

  nodes.push(
    buildDataControls(options),
    buildPrivacyFooterLinks(options),
    buildPrivacyStatusMessage(bindings)
  );
  return { nodes, bindings };
}

function buildConsentGrid(
  options: PrivacyLayoutOptions,
  bindings: PrivacyLayoutBindings
): HTMLElement {
  const grid = options.createElement('div');
  grid.className = 'grid gap-4 sm:grid-cols-2';
  grid.append(
    buildConsentCard(
      options,
      'analyticsConsent',
      'analyticsConsentTitle',
      'analyticsConsentDescription',
      (input) => {
        bindings.analyticsCheckbox = input;
      }
    ),
    buildConsentCard(
      options,
      'errorReportingConsent',
      'errorReportingConsentTitle',
      'errorReportingConsentDescription',
      (input) => {
        bindings.errorReportingCheckbox = input;
      }
    )
  );
  return grid;
}

function buildConsentCard(
  options: PrivacyLayoutOptions,
  id: string,
  titleKey: keyof Messages,
  descriptionKey: keyof Messages,
  bindInput: (input: HTMLInputElement) => void
): HTMLElement {
  const card = createOptionsPanel({
    className: 'rounded-lg border border-base-300 bg-base-100 p-4 shadow-sm'
  });
  const content = options.createElement('div');
  content.className = 'grid gap-2';
  const label = options.createElement('div');
  const checkbox = new UiCheckbox(label);
  const input = checkbox.render({ id, label: ' ' });

  const span = label.querySelector('span');
  if (span instanceof HTMLElement) {
    options.applyI18nText(span, titleKey);
  }

  const description = options.createElement('p');
  description.className = 'text-sm text-base-content/60';
  options.applyI18nText(description, descriptionKey);

  content.append(label, description);
  card.append(content);
  bindInput(input);
  return card;
}

function buildConsentHints(options: PrivacyLayoutOptions): HTMLElement {
  const wrapper = options.createElement('div');
  wrapper.className = 'grid gap-4 sm:grid-cols-2';
  wrapper.append(
    buildHintCard(
      options,
      'errorReportingCollectedTitle',
      [
        'errorReportingCollectedError',
        'errorReportingCollectedBrowser',
        'errorReportingCollectedExtension',
        'errorReportingCollectedTimestamp'
      ],
      'collected'
    ),
    buildHintCard(
      options,
      'errorReportingNotCollectedTitle',
      [
        'errorReportingNotCollectedPersonal',
        'errorReportingNotCollectedUrls',
        'errorReportingNotCollectedContent',
        'errorReportingNotCollectedPasswords'
      ],
      'excluded'
    )
  );
  return wrapper;
}

function buildHintCard(
  options: PrivacyLayoutOptions,
  titleKey: keyof Messages,
  itemKeys: Array<keyof Messages>,
  variant: 'collected' | 'excluded'
): HTMLElement {
  const card = createOptionsPanel({
    tag: 'section',
    className: [
      'rounded-lg',
      'border',
      'border-base-300',
      'bg-base-200',
      'p-4',
      variant === 'collected' ? 'border-l-4 border-l-accent' : 'border-l-4 border-l-border'
    ].join(' ')
  });
  const title = options.createElement('h3');
  title.className = 'text-sm font-semibold mb-2';
  options.applyI18nText(title, titleKey);
  card.append(title, buildList(options, itemKeys));
  return card;
}

function buildList(options: PrivacyLayoutOptions, keys: Array<keyof Messages>): HTMLElement {
  const list = createOptionsMessageList([], {
    className: 'list-disc pl-4 space-y-1 text-sm text-base-content/60'
  });
  for (const key of keys) {
    const item = document.createElement('li');
    options.applyI18nText(item, key);
    list.append(item);
  }
  return list;
}

function buildDebugSection(
  options: PrivacyLayoutOptions,
  bindings: PrivacyLayoutBindings
): HTMLElement {
  const section = createOptionsSettingRow();

  const label = options.createElement('div');
  label.className = 'text-sm font-medium text-base-content/60';
  options.applyI18nText(label, 'analyticsDebugTitle');

  const content = document.createElement('div');
  const checkboxHost = options.createElement('div');
  const input = new UiCheckbox(checkboxHost).render({
    id: 'analyticsDebugMode',
    label: ' '
  });

  const checkboxLabel = checkboxHost.querySelector('label') ?? checkboxHost;
  const span = checkboxHost.querySelector('span');
  if (span instanceof HTMLElement) {
    options.applyI18nText(span, 'analyticsDebugTitle');
  } else {
    const fallback = options.createElement('span');
    options.applyI18nText(fallback, 'analyticsDebugTitle');
    checkboxLabel.append(fallback);
  }

  const description = createOptionsHintText({ className: 'text-sm text-base-content/60 mt-1' });
  options.applyI18nText(description, 'analyticsDebugDescription');

  const hint = createOptionsHintText({
    className: 'mt-2 rounded border border-warning/20 bg-warning/10 p-2 text-sm text-warning'
  });
  options.applyI18nText(hint, 'analyticsDebugDisabledHint');
  hint.hidden = true;

  content.append(checkboxLabel, description, hint);
  section.append(label, content);

  bindings.debugModeToggle = input;
  bindings.debugModeHint = hint;

  return section;
}

function buildDataControls(options: PrivacyLayoutOptions): HTMLElement {
  const section = createOptionsSettingRow();
  const control = createOptionsActionRow({ className: 'flex flex-wrap justify-start gap-2' });
  const buttonHost = options.createElement('div');
  const button = new UiButton(buttonHost).render({
    label: '',
    variant: 'primary'
  });
  button.id = 'clearAllData';
  options.applyI18nText(button, 'clearAllAnalyticsData');
  control.append(buttonHost);

  const note = createOptionsHintText();
  options.applyI18nText(note, 'privacySettingsNote');

  section.append(control, note);
  return section;
}
