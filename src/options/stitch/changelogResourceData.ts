import type { Messages } from '@i18n';
import {
  DEFAULT_PRODUCTION_ENGLISH_MESSAGES,
  resolveSchemaMessage,
  type SchemaMessageKey
} from './schema/i18n';
import type { PreviewContent } from './types';

type ChangelogEntryDefinition = {
  version: string;
  date: string;
  summaryKey?: SchemaMessageKey;
  bulletKeys: readonly SchemaMessageKey[];
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

export function createChangelogResource(
  messages: Messages | null = DEFAULT_PRODUCTION_ENGLISH_MESSAGES
): PreviewContent['resources']['changelog'] {
  return {
    hero: {
      title: resolveSchemaMessage(messages, CHANGELOG_TITLE_KEY),
      description: resolveSchemaMessage(messages, CHANGELOG_DESCRIPTION_KEY),
      pills: [...CHANGELOG_HERO_PILLS],
      icon: 'history'
    },
    entries: CHANGELOG_ENTRY_DEFINITIONS.map((entry) => ({
      version: entry.version,
      date: entry.date,
      ...(entry.summaryKey
        ? {
            summary: resolveSchemaMessage(messages, entry.summaryKey)
          }
        : {}),
      bullets: entry.bulletKeys.map((key) => resolveSchemaMessage(messages, key))
    }))
  };
}

export const changelogResource = createChangelogResource();
