import type { SchemaMessageKey } from '../i18n';
import type { ChangelogEntry, ResourceSchema, SchemaContext } from '../../types';
import { div } from '../builders/primitives';
import { releaseCard } from '../builders/resources';
import { DEFAULT_PRODUCTION_ENGLISH_MESSAGES } from '../i18n';

type ChangelogNoteSection = NonNullable<ChangelogEntry['notes']>[number];

const BULLET_KEYS_BY_VERSION: Record<string, SchemaMessageKey[]> = {
  'v0.2.0': [
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
  ],
  'v0.1.0': [
    'schemaResourceChangelogV010Bullet1',
    'schemaResourceChangelogV010Bullet2',
    'schemaResourceChangelogV010Bullet3',
    'schemaResourceChangelogV010Bullet4',
    'schemaResourceChangelogV010Bullet5',
    'schemaResourceChangelogV010Bullet6'
  ]
};
const USAGE_ADVICE_TITLE_KEY: SchemaMessageKey = 'schemaResourceChangelogUsageAdviceTitle';
const USAGE_ADVICE_ITEM_KEYS: SchemaMessageKey[] = [
  'schemaResourceChangelogUsageAdvice1',
  'schemaResourceChangelogUsageAdvice2',
  'schemaResourceChangelogUsageAdvice3'
];

function localizeText(
  ctx: SchemaContext,
  key: SchemaMessageKey | undefined,
  fallback: string
): string {
  const englishFallback = key ? (DEFAULT_PRODUCTION_ENGLISH_MESSAGES[key] ?? fallback) : fallback;
  if (!ctx.messages || !key) {
    return englishFallback;
  }
  return ctx.t?.(key, englishFallback) ?? englishFallback;
}

function localizeNoteSection(
  ctx: SchemaContext,
  section: ChangelogNoteSection
): ChangelogNoteSection {
  return {
    ...section,
    title: localizeText(ctx, USAGE_ADVICE_TITLE_KEY, section.title),
    items: section.items.map((item, index) =>
      localizeText(ctx, USAGE_ADVICE_ITEM_KEYS[index], item)
    )
  };
}

function localizeEntry(ctx: SchemaContext, entry: ChangelogEntry): ChangelogEntry {
  const localized: ChangelogEntry = {
    ...entry,
    bullets: entry.bullets.map((bullet, index) =>
      localizeText(ctx, BULLET_KEYS_BY_VERSION[entry.version]?.[index], bullet)
    )
  };
  if (entry.notes) {
    localized.notes = entry.notes.map((section) => localizeNoteSection(ctx, section));
  }
  return localized;
}

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const resource = ctx.appData.resources.changelog;
    const shouldLocalize = Boolean(ctx.messages);
    return {
      id: 'changelog',
      kind: 'modal',
      title: shouldLocalize
        ? (ctx.t?.('schemaResourceChangelogTitle', 'Changelog') ?? 'Changelog')
        : 'Changelog',
      description: shouldLocalize
        ? (ctx.t?.(
            'schemaResourceChangelogDescription',
            'This modal highlights the latest shipped updates from the project changelog.'
          ) ?? 'This modal highlights the latest shipped updates from the project changelog.')
        : 'This modal highlights the latest shipped updates from the project changelog.',
      size: 'large',
      children: [
        div(
          'release-list',
          resource.entries.map((entry) =>
            releaseCard({
              ...(shouldLocalize ? localizeEntry(ctx, entry) : entry)
            })
          )
        )
      ]
    };
  }
};

export default schema;
