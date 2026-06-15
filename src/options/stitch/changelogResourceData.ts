import type { Messages } from '@i18n';
import { DEFAULT_PRODUCTION_ENGLISH_MESSAGES, type SchemaMessageKey } from './schema/i18n';
import type { PreviewContent } from './types';

type ChangelogNoteSectionDefinition = {
  titleKey: SchemaMessageKey;
  itemKeys: readonly SchemaMessageKey[];
};

type ChangelogEntryDefinition = {
  version: string;
  date: string;
  bulletKeys: readonly SchemaMessageKey[];
  notes?: readonly ChangelogNoteSectionDefinition[];
};

const CHANGELOG_TITLE_KEY: SchemaMessageKey = 'schemaResourceChangelogTitle';
const CHANGELOG_DESCRIPTION_KEY: SchemaMessageKey = 'schemaResourceChangelogDescription';
const CHANGELOG_HERO_PILLS = [
  'v0.2.0',
  'Settings Center',
  'Multi-Vault',
  'Video',
  '12 Languages'
] as const;

const CHANGELOG_ENTRY_DEFINITIONS: readonly ChangelogEntryDefinition[] = [
  {
    version: 'v0.2.0',
    date: '2026-06-10',
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
    ],
    notes: [
      {
        titleKey: 'schemaResourceChangelogUsageAdviceTitle',
        itemKeys: [
          'schemaResourceChangelogUsageAdvice1',
          'schemaResourceChangelogUsageAdvice2',
          'schemaResourceChangelogUsageAdvice3'
        ]
      }
    ]
  },
  {
    version: 'v0.1.0',
    date: '2025-10-13',
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

function resolveSchemaMessage(
  messages: Messages | null | undefined,
  key: SchemaMessageKey,
  fallback?: string
): string {
  const localized = messages?.[key];
  if (typeof localized === 'string' && localized.length > 0) {
    return localized;
  }

  const english = DEFAULT_PRODUCTION_ENGLISH_MESSAGES[key];
  if (typeof english === 'string' && english.length > 0) {
    return english;
  }

  return fallback ?? key;
}

export function createChangelogResource(
  messages: Messages | null = DEFAULT_PRODUCTION_ENGLISH_MESSAGES
): PreviewContent['resources']['changelog'] {
  return {
    hero: {
      title: resolveSchemaMessage(messages, CHANGELOG_TITLE_KEY, 'Changelog'),
      description: resolveSchemaMessage(
        messages,
        CHANGELOG_DESCRIPTION_KEY,
        'This modal highlights the latest shipped updates from the project changelog.'
      ),
      pills: [...CHANGELOG_HERO_PILLS],
      icon: 'history'
    },
    entries: CHANGELOG_ENTRY_DEFINITIONS.map((entry) => ({
      version: entry.version,
      date: entry.date,
      bullets: entry.bulletKeys.map((key) => resolveSchemaMessage(messages, key)),
      ...(entry.notes
        ? {
            notes: entry.notes.map((section) => ({
              title: resolveSchemaMessage(messages, section.titleKey),
              items: section.itemKeys.map((key) => resolveSchemaMessage(messages, key))
            }))
          }
        : {})
    }))
  };
}

export const changelogResource = createChangelogResource();
