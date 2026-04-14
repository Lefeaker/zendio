import type { Messages } from '@i18n';
import { createOptionsPanel, createOptionsSettingRow } from '../../primitives/layout';
import type { PrivacyLayoutBindings, PrivacyLayoutOptions } from './privacySettingsLayout';

export function buildPrivacyFooterLinks(options: PrivacyLayoutOptions): HTMLElement {
  const section = createOptionsSettingRow();

  const label = options.createElement('div');
  label.className = 'text-sm font-medium text-base-content/60';
  options.applyI18nText(label, 'privacySettingsDescription');

  const content = document.createElement('div');
  const linkStack = options.createElement('div');
  linkStack.className = 'flex gap-4 mb-2';

  const policy = buildFooterLink(options, 'privacyPolicyLink', 'privacyPolicyLink');
  const dataUsage = buildFooterLink(options, 'dataUsageLink', 'dataUsageLink');
  linkStack.append(policy, dataUsage);

  const footer = options.createElement('p');
  footer.className = 'text-sm text-base-content/60';
  options.applyI18nText(footer, 'privacyFooterText');

  content.append(linkStack, footer);
  section.append(label, content);
  return section;
}

function buildFooterLink(
  options: PrivacyLayoutOptions,
  id: string,
  labelKey: keyof Messages
): HTMLAnchorElement {
  const link = options.createElement('a');
  link.className = 'text-sm text-accent hover:underline';
  link.setAttribute('href', '#');
  link.id = id;
  options.applyI18nText(link, labelKey);
  return link;
}

export function buildPrivacyStatusMessage(bindings: PrivacyLayoutBindings): HTMLElement {
  const status = createOptionsPanel({
    className: [
      'fixed',
      'bottom-4',
      'right-4',
      'z-50',
      'rounded-lg',
      'border',
      'border-base-300',
      'bg-base-100',
      'p-4',
      'shadow-lg'
    ].join(' '),
    attributes: {
      id: 'privacyStatusMessage',
      'aria-live': 'polite'
    }
  });
  status.hidden = true;
  bindings.statusMessage = status;
  return status;
}
