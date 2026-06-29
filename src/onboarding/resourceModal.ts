import type { Messages } from '@i18n/messages';
import { GENERATED_RELEASE_SCHEMA_MESSAGES_EN } from '@i18n/generated/schema/en.generated';
import { ZENDIO_RESOURCE_LINKS } from '@shared/links/zendioResourceLinks';
import { replaceChildrenWithSafeRichText } from '@shared/i18n/richTextDom';
export type OnboardingResourceId =
  | 'support'
  | 'suggestions'
  | 'contact'
  | 'changelog'
  | 'privacy-policy'
  | 'terms-of-use';

type MessageKey = keyof Messages;
type MessageSource = Partial<Messages>;
type MessageResolver = (key: MessageKey) => string;

interface OnboardingResourceModalRequest {
  language: string;
  messages: MessageSource;
  resolveAssetUrl?: (path: string) => string;
  resourceId: OnboardingResourceId;
}

interface ResourceModalView {
  body: Node[];
  description: string;
  size?: 'large';
  title: string;
}

interface LegalSectionDefinition {
  bullets?: readonly MessageKey[];
  html?: boolean;
  paragraphs: readonly MessageKey[];
  title: MessageKey;
}

interface ChangelogEntryDefinition {
  bulletKeys: readonly MessageKey[];
  date: string;
  summaryKey: MessageKey;
  version: string;
}

const SUPPORT_KEYS: readonly MessageKey[] = [
  'schemaResourceSupportTitle',
  'schemaResourceSupportDescription',
  'schemaResourceSupportChannelsGroupTitle',
  'schemaResourceSupportKoFiTitle',
  'schemaResourceSupportKoFiDescription',
  'schemaResourceSupportAfdianTitle',
  'schemaResourceSupportAfdianDescription'
];

const SUGGESTION_KEYS: readonly MessageKey[] = [
  'schemaResourceSuggestionsTitle',
  'schemaResourceSuggestionsDescription',
  'schemaResourceSuggestionsGithubTitle',
  'schemaResourceSuggestionsGithubDescription',
  'schemaResourceSuggestionsXiaohongshuTitle',
  'schemaResourceSuggestionsXiaohongshuQrCaption',
  'schemaResourceSuggestionsRedditDescription',
  'schemaResourceSuggestionsXiaohongshuDescription',
  'schemaResourceContactEmailTitle'
];

const CONTACT_KEYS: readonly MessageKey[] = [
  'schemaResourceContactTitle',
  'schemaResourceContactDescription'
];

const CHANGELOG_ENTRIES: readonly ChangelogEntryDefinition[] = [
  {
    version: 'v0.2.0',
    date: '2026-06-10',
    summaryKey: 'schemaResourceChangelogV020Summary',
    bulletKeys: [
      'schemaResourceChangelogV020Bullet1',
      'schemaResourceChangelogV020Bullet2',
      'schemaResourceChangelogV020Bullet3',
      'schemaResourceChangelogV020Bullet4',
      'schemaResourceChangelogV020Bullet5',
      'schemaResourceChangelogV020Bullet6',
      'schemaResourceChangelogV020Bullet7',
      'schemaResourceChangelogV020Bullet8',
      'schemaResourceChangelogV020Bullet9',
      'schemaResourceChangelogV020Bullet10'
    ]
  },
  {
    version: 'v0.1.0',
    date: '2025-10-13',
    summaryKey: 'schemaResourceChangelogV010Summary',
    bulletKeys: [
      'schemaResourceChangelogV010Bullet1',
      'schemaResourceChangelogV010Bullet2',
      'schemaResourceChangelogV010Bullet3',
      'schemaResourceChangelogV010Bullet4',
      'schemaResourceChangelogV010Bullet5',
      'schemaResourceChangelogV010Bullet6'
    ]
  }
];

const CHANGELOG_KEYS: readonly MessageKey[] = [
  'schemaResourceChangelogTitle',
  'schemaResourceChangelogDescription',
  ...CHANGELOG_ENTRIES.flatMap((entry) => [entry.summaryKey, ...entry.bulletKeys])
];

const TERMS_SECTIONS: readonly LegalSectionDefinition[] = [
  section('schemaResourceTermsEffectiveTitle', ['schemaResourceTermsEffectiveBody']),
  section('schemaResourceTermsAcceptanceTitle', ['schemaResourceTermsAcceptanceBody']),
  section('schemaResourceTermsProductTitle', ['schemaResourceTermsProductBody']),
  section('schemaResourceTermsLocalFirstTitle', ['schemaResourceTermsLocalFirstBody']),
  section(
    'schemaResourceTermsUserResponsibilityTitle',
    ['schemaResourceTermsUserResponsibilityBody'],
    [
      'schemaResourceTermsUserResponsibilityBulletContent',
      'schemaResourceTermsUserResponsibilityBulletDestinations',
      'schemaResourceTermsUserResponsibilityBulletThirdParty',
      'schemaResourceTermsUserResponsibilityBulletSecurity'
    ]
  ),
  section('schemaResourceTermsThirdPartyTitle', ['schemaResourceTermsThirdPartyBody']),
  section('schemaResourceTermsPrivacyTitle', ['schemaResourceTermsPrivacyBody']),
  section('schemaResourceTermsAvailabilityTitle', ['schemaResourceTermsAvailabilityBody']),
  section('schemaResourceTermsLiabilityTitle', ['schemaResourceTermsLiabilityBody']),
  section('schemaResourceTermsChangesTitle', ['schemaResourceTermsChangesBody']),
  section('schemaResourceTermsContactTitle', ['schemaResourceTermsContactBody'], [], true)
];

const PRIVACY_SECTIONS: readonly LegalSectionDefinition[] = [
  section('schemaResourcePrivacyPolicyEffectiveTitle', [
    'schemaResourcePrivacyPolicyEffectiveBody'
  ]),
  section('schemaResourcePrivacyPolicyScopeTitle', ['schemaResourcePrivacyPolicyScopeBody']),
  section('schemaResourcePrivacyPolicyLocalFirstTitle', [
    'schemaResourcePrivacyPolicyLocalFirstBody'
  ]),
  section(
    'schemaResourcePrivacyPolicyLocalDataTitle',
    ['schemaResourcePrivacyPolicyLocalDataBody'],
    [
      'schemaResourcePrivacyPolicyLocalDataBulletClip',
      'schemaResourcePrivacyPolicyLocalDataBulletConfig',
      'schemaResourcePrivacyPolicyLocalDataBulletFolder',
      'schemaResourcePrivacyPolicyLocalDataBulletDrafts'
    ]
  ),
  section('schemaResourcePrivacyPolicyObsidianTitle', ['schemaResourcePrivacyPolicyObsidianBody']),
  section(
    'schemaResourcePrivacyPolicyTelemetryTitle',
    ['schemaResourcePrivacyPolicyTelemetryBody'],
    [
      'schemaResourcePrivacyPolicyTelemetryBulletAnalytics',
      'schemaResourcePrivacyPolicyTelemetryBulletErrors',
      'schemaResourcePrivacyPolicyTelemetryBulletProxy',
      'schemaResourcePrivacyPolicyTelemetryBulletIdentifiers'
    ]
  ),
  section(
    'schemaResourcePrivacyPolicyNotCollectedTitle',
    ['schemaResourcePrivacyPolicyNotCollectedBody'],
    [
      'schemaResourcePrivacyPolicyNotCollectedBulletContent',
      'schemaResourcePrivacyPolicyNotCollectedBulletUrls',
      'schemaResourcePrivacyPolicyNotCollectedBulletSecrets',
      'schemaResourcePrivacyPolicyNotCollectedBulletIdentity'
    ]
  ),
  section('schemaResourcePrivacyPolicySharingTitle', ['schemaResourcePrivacyPolicySharingBody']),
  section('schemaResourcePrivacyPolicyRetentionTitle', [
    'schemaResourcePrivacyPolicyRetentionBody'
  ]),
  section('schemaResourcePrivacyPolicySecurityTitle', ['schemaResourcePrivacyPolicySecurityBody']),
  section('schemaResourcePrivacyPolicyChoicesTitle', ['schemaResourcePrivacyPolicyChoicesBody']),
  section('schemaResourcePrivacyPolicyUpdatesTitle', ['schemaResourcePrivacyPolicyUpdatesBody']),
  section(
    'schemaResourcePrivacyPolicyContactTitle',
    ['schemaResourcePrivacyPolicyContactBody'],
    [],
    true
  )
];

const TERMS_KEYS: readonly MessageKey[] = [
  'schemaResourceTermsTitle',
  'schemaResourceTermsDescription',
  ...collectLegalSectionKeys(TERMS_SECTIONS)
];
const PRIVACY_KEYS: readonly MessageKey[] = [
  'schemaResourcePrivacyPolicyTitle',
  'schemaResourcePrivacyPolicyDescription',
  ...collectLegalSectionKeys(PRIVACY_SECTIONS)
];

const RESOURCE_KEYS: Record<OnboardingResourceId, readonly MessageKey[]> = {
  support: SUPPORT_KEYS,
  suggestions: SUGGESTION_KEYS,
  contact: CONTACT_KEYS,
  changelog: CHANGELOG_KEYS,
  'terms-of-use': TERMS_KEYS,
  'privacy-policy': PRIVACY_KEYS
};

const ABSOLUTE_ASSET_URL = /^(?:[a-z][a-z\d+\-.]*:|\/\/|\/)/i;

function section(
  title: MessageKey,
  paragraphs: readonly MessageKey[],
  bullets: readonly MessageKey[] = [],
  html = false
): LegalSectionDefinition {
  return { title, paragraphs, bullets, html };
}

function collectLegalSectionKeys(sections: readonly LegalSectionDefinition[]): MessageKey[] {
  return sections.flatMap((item) => [item.title, ...item.paragraphs, ...(item.bullets ?? [])]);
}

function readMessage(source: MessageSource | null | undefined, key: MessageKey): string {
  const value = source?.[key];
  return typeof value === 'string' && value.length > 0 ? value : '';
}

function loadSchemaFallbackMessages(): MessageSource {
  return GENERATED_RELEASE_SCHEMA_MESSAGES_EN;
}

function createMessageResolver({
  messages,
  resourceId
}: OnboardingResourceModalRequest): MessageResolver {
  const primary = messages;
  const needsFallback = RESOURCE_KEYS[resourceId].some((key) => !readMessage(primary, key));
  const fallback = needsFallback ? loadSchemaFallbackMessages() : null;

  return (key) => readMessage(primary, key) || readMessage(fallback, key) || String(key);
}

function resolveAssetUrl(path: string, runtimeAssetUrlResolver?: (path: string) => string): string {
  if (ABSOLUTE_ASSET_URL.test(path)) {
    return path;
  }
  const normalizedPath = path.replace(/^\.\/+/, '').replace(/^(?:\.\.\/)+/, '');
  return runtimeAssetUrlResolver ? runtimeAssetUrlResolver(normalizedPath) : `../${normalizedPath}`;
}

function append(parent: Node, ...children: Array<Node | string | null | undefined>): void {
  for (const child of children) {
    if (child === null || child === undefined) continue;
    parent.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
}

function createElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string
): HTMLElementTagNameMap[K] {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  return element;
}

function paragraph(text: string, html = false): HTMLParagraphElement {
  const element = createElement('p');
  if (html) {
    replaceChildrenWithSafeRichText(element, text);
  } else {
    element.textContent = text;
  }
  return element;
}

function createSection(title: string, children: Node[]): HTMLElement {
  const sectionElement = createElement('section', 'resource-modal-section');
  const heading = createElement('div', 'resource-modal-section-title');
  heading.textContent = title;
  append(sectionElement, heading, ...children);
  return sectionElement;
}

function createList(items: readonly string[]): HTMLUListElement {
  const list = createElement('ul');
  for (const item of items) {
    const listItem = createElement('li');
    listItem.textContent = item;
    list.append(listItem);
  }
  return list;
}

function createResourceCard(options: {
  href?: string;
  icon?: string;
  image?: string;
  imageAlt?: string;
  resolveAssetUrl?: (path: string) => string;
  subtitle?: string;
  title: string;
}): HTMLElement {
  const card = createElement(
    options.href ? 'a' : options.image ? 'button' : 'div',
    [
      'resource-link-card',
      options.image && !options.href ? 'has-modal-preview' : '',
      !options.href && !options.image ? 'is-static' : ''
    ]
      .filter(Boolean)
      .join(' ')
  );
  if (options.href) {
    card.setAttribute('href', options.href);
    card.setAttribute('target', '_blank');
    card.setAttribute('rel', 'noopener noreferrer');
  }
  if (options.image && !options.href) {
    card.setAttribute('type', 'button');
    card.dataset.role = 'resource-image-modal-trigger';
    card.setAttribute('aria-haspopup', 'dialog');
    card.setAttribute('aria-label', options.imageAlt ?? options.title);
    card.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      showResourceImageModal({
        alt: options.imageAlt ?? options.title,
        src: resolveAssetUrl(options.image ?? '', options.resolveAssetUrl)
      });
    });
  }
  if (options.icon) {
    const icon = createElement('img', 'resource-link-icon');
    icon.src = resolveAssetUrl(options.icon, options.resolveAssetUrl);
    icon.alt = `${options.title} icon`;
    card.append(icon);
  }
  const copy = createElement('div', 'resource-link-copy');
  const title = createElement('strong');
  title.textContent = options.title;
  copy.append(title);
  if (options.subtitle) {
    const subtitle = createElement('span');
    subtitle.textContent = options.subtitle;
    copy.append(subtitle);
  }
  card.append(copy);
  return card;
}

function createSupportView(
  t: MessageResolver,
  runtimeAssetUrlResolver?: (path: string) => string
): ResourceModalView {
  const grid = createElement('div', 'resource-card-grid');
  append(
    grid,
    createResourceCard({
      href: ZENDIO_RESOURCE_LINKS.koFi,
      icon: './icons/ko-fi.svg',
      resolveAssetUrl: runtimeAssetUrlResolver,
      subtitle: t('schemaResourceSupportKoFiDescription'),
      title: t('schemaResourceSupportKoFiTitle')
    }),
    createResourceCard({
      icon: './icons/wechat-reward.svg',
      image: './icons/wechat-reward-qr.jpg',
      imageAlt: t('schemaResourceSupportAfdianTitle'),
      resolveAssetUrl: runtimeAssetUrlResolver,
      subtitle: t('schemaResourceSupportAfdianDescription'),
      title: t('schemaResourceSupportAfdianTitle')
    })
  );
  const stack = createElement('div', 'resource-modal-stack');
  append(stack, createSection(t('schemaResourceSupportChannelsGroupTitle'), [grid]));
  return {
    title: t('schemaResourceSupportTitle'),
    description: t('schemaResourceSupportDescription'),
    body: [stack]
  };
}

function createInlineLink(label: string, href: string): HTMLAnchorElement {
  const link = createElement('a');
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = label;
  return link;
}

function createXiaohongshuPopoverLink(label: string, caption: string): HTMLElement {
  const host = createElement('span', 'resource-inline-popover-host');
  const trigger = createElement('button', 'resource-inline-popover-trigger');
  trigger.type = 'button';
  trigger.dataset.role = 'xiaohongshu-feedback-qr-trigger';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.textContent = label;
  const popover = createElement('span', 'resource-inline-popover');
  popover.setAttribute('role', 'dialog');
  popover.setAttribute('aria-label', label);
  const image = createElement('img', 'resource-inline-popover-media');
  image.src = ZENDIO_RESOURCE_LINKS.xiaohongshuFeedbackQr;
  image.alt = label;
  const captionElement = createElement('span', 'resource-inline-popover-caption');
  captionElement.textContent = caption;
  append(popover, image, captionElement);
  append(host, trigger, popover);
  return host;
}

function createSuggestionsView(t: MessageResolver): ResourceModalView {
  const copy = createElement('p', 'resource-inline-copy');
  append(
    copy,
    t('schemaResourceSuggestionsDescription'),
    createInlineLink(
      t('schemaResourceSuggestionsGithubTitle'),
      ZENDIO_RESOURCE_LINKS.githubIssuesNew
    ),
    t('schemaResourceSuggestionsGithubDescription'),
    createXiaohongshuPopoverLink(
      t('schemaResourceSuggestionsXiaohongshuTitle'),
      t('schemaResourceSuggestionsXiaohongshuQrCaption')
    ),
    t('schemaResourceSuggestionsRedditDescription'),
    createInlineLink(t('schemaResourceContactEmailTitle'), ZENDIO_RESOURCE_LINKS.supportEmail),
    t('schemaResourceSuggestionsXiaohongshuDescription')
  );
  const stack = createElement('div', 'resource-modal-stack');
  stack.append(copy);
  return {
    title: t('schemaResourceSuggestionsTitle'),
    description: '',
    body: [stack]
  };
}

function createContactView(t: MessageResolver): ResourceModalView {
  const stack = createElement('div', 'resource-modal-stack');
  stack.append(paragraph(t('schemaResourceContactDescription'), true));
  return {
    title: t('schemaResourceContactTitle'),
    description: '',
    body: [stack]
  };
}

function createChangelogView(t: MessageResolver): ResourceModalView {
  const list = createElement('div', 'release-list');
  for (const entry of CHANGELOG_ENTRIES) {
    const card = createElement('article', 'release-card');
    const header = createElement('div', 'release-header');
    const version = createElement('strong');
    version.textContent = entry.version;
    const date = createElement('span', 'release-date');
    date.textContent = entry.date;
    append(header, version, date);
    append(card, header, paragraph(t(entry.summaryKey)), createList(entry.bulletKeys.map(t)));
    list.append(card);
  }
  return {
    title: t('schemaResourceChangelogTitle'),
    description: t('schemaResourceChangelogDescription'),
    size: 'large',
    body: [list]
  };
}

function createLegalView(
  t: MessageResolver,
  titleKey: MessageKey,
  descriptionKey: MessageKey,
  sections: readonly LegalSectionDefinition[]
): ResourceModalView {
  const stack = createElement('div', 'resource-modal-stack');
  for (const item of sections) {
    const children = [
      ...item.paragraphs.map((key) => paragraph(t(key), item.html)),
      ...(item.bullets?.length ? [createList(item.bullets.map(t))] : [])
    ];
    stack.append(createSection(t(item.title), children));
  }
  return {
    title: t(titleKey),
    description: t(descriptionKey),
    size: 'large',
    body: [stack]
  };
}

function createView(
  resourceId: OnboardingResourceId,
  t: MessageResolver,
  runtimeAssetUrlResolver?: (path: string) => string
): ResourceModalView {
  switch (resourceId) {
    case 'support':
      return createSupportView(t, runtimeAssetUrlResolver);
    case 'suggestions':
      return createSuggestionsView(t);
    case 'contact':
      return createContactView(t);
    case 'changelog':
      return createChangelogView(t);
    case 'terms-of-use':
      return createLegalView(
        t,
        'schemaResourceTermsTitle',
        'schemaResourceTermsDescription',
        TERMS_SECTIONS
      );
    case 'privacy-policy':
      return createLegalView(
        t,
        'schemaResourcePrivacyPolicyTitle',
        'schemaResourcePrivacyPolicyDescription',
        PRIVACY_SECTIONS
      );
  }
}

function closeResourceImageModal(): void {
  document.querySelectorAll('.resource-image-modal-overlay').forEach((modal) => modal.remove());
}

function showResourceImageModal(image: { alt: string; src: string }): void {
  closeResourceImageModal();
  const overlay = createElement('div', 'resource-image-modal-overlay');
  const modal = createElement('div', 'resource-image-modal');
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  modal.setAttribute('aria-label', image.alt);
  const media = createElement('img', 'resource-image-modal-media');
  media.src = image.src;
  media.alt = image.alt;
  modal.append(media);
  overlay.append(modal);
  function close(): void {
    overlay.remove();
    document.removeEventListener('keydown', handleKeyDown, true);
  }
  function handleKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') close();
  }
  overlay.addEventListener('click', close);
  modal.addEventListener('click', (event) => event.stopPropagation());
  document.addEventListener('keydown', handleKeyDown, true);
  document.body.append(overlay);
}

function closeResourceModals(): void {
  document.querySelectorAll('.resource-modal-overlay').forEach((modal) => modal.remove());
  closeResourceImageModal();
}

function renderModal(view: ResourceModalView): HTMLElement {
  const overlay = createElement('div', 'resource-modal-overlay');
  const modal = createElement('div', ['resource-modal', view.size ?? 'medium'].join(' '));
  modal.setAttribute('role', 'dialog');
  modal.setAttribute('aria-modal', 'true');
  const header = createElement('div', 'resource-modal-header');
  const headings = createElement('div', 'resource-modal-headings');
  const title = createElement('h2');
  title.textContent = view.title;
  append(headings, title, view.description ? paragraph(view.description) : null);
  const body = createElement('div', 'resource-modal-body');
  append(body, ...view.body);
  append(header, headings);
  append(modal, header, body);
  overlay.addEventListener('click', closeResourceModals);
  modal.addEventListener('click', (event) => event.stopPropagation());
  overlay.append(modal);
  return overlay;
}

export function renderOnboardingResourceModal(request: OnboardingResourceModalRequest): void {
  const t = createMessageResolver(request);
  closeResourceModals();
  document.body.append(renderModal(createView(request.resourceId, t, request.resolveAssetUrl)));
}
