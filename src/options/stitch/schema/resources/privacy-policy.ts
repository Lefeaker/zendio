import type { ResourceSchema } from '../../types';
import { paragraph } from '../builders/primitives';
import { modalSection, resourceModalStack } from '../builders/resources';
import { translateSchemaMessage, type SchemaMessageKey } from '../i18n';

interface LegalSection {
  title: SchemaMessageKey;
  paragraphs: SchemaMessageKey[];
  bullets?: SchemaMessageKey[];
}

const PRIVACY_POLICY_SECTIONS: LegalSection[] = [
  {
    title: 'schemaResourcePrivacyPolicyEffectiveTitle',
    paragraphs: ['schemaResourcePrivacyPolicyEffectiveBody']
  },
  {
    title: 'schemaResourcePrivacyPolicyScopeTitle',
    paragraphs: ['schemaResourcePrivacyPolicyScopeBody']
  },
  {
    title: 'schemaResourcePrivacyPolicyLocalFirstTitle',
    paragraphs: ['schemaResourcePrivacyPolicyLocalFirstBody']
  },
  {
    title: 'schemaResourcePrivacyPolicyLocalDataTitle',
    paragraphs: ['schemaResourcePrivacyPolicyLocalDataBody'],
    bullets: [
      'schemaResourcePrivacyPolicyLocalDataBulletClip',
      'schemaResourcePrivacyPolicyLocalDataBulletConfig',
      'schemaResourcePrivacyPolicyLocalDataBulletFolder',
      'schemaResourcePrivacyPolicyLocalDataBulletDrafts'
    ]
  },
  {
    title: 'schemaResourcePrivacyPolicyObsidianTitle',
    paragraphs: ['schemaResourcePrivacyPolicyObsidianBody']
  },
  {
    title: 'schemaResourcePrivacyPolicyTelemetryTitle',
    paragraphs: ['schemaResourcePrivacyPolicyTelemetryBody'],
    bullets: [
      'schemaResourcePrivacyPolicyTelemetryBulletAnalytics',
      'schemaResourcePrivacyPolicyTelemetryBulletErrors',
      'schemaResourcePrivacyPolicyTelemetryBulletProxy',
      'schemaResourcePrivacyPolicyTelemetryBulletIdentifiers'
    ]
  },
  {
    title: 'schemaResourcePrivacyPolicyNotCollectedTitle',
    paragraphs: ['schemaResourcePrivacyPolicyNotCollectedBody'],
    bullets: [
      'schemaResourcePrivacyPolicyNotCollectedBulletContent',
      'schemaResourcePrivacyPolicyNotCollectedBulletUrls',
      'schemaResourcePrivacyPolicyNotCollectedBulletSecrets',
      'schemaResourcePrivacyPolicyNotCollectedBulletIdentity'
    ]
  },
  {
    title: 'schemaResourcePrivacyPolicySharingTitle',
    paragraphs: ['schemaResourcePrivacyPolicySharingBody']
  },
  {
    title: 'schemaResourcePrivacyPolicyRetentionTitle',
    paragraphs: ['schemaResourcePrivacyPolicyRetentionBody']
  },
  {
    title: 'schemaResourcePrivacyPolicySecurityTitle',
    paragraphs: ['schemaResourcePrivacyPolicySecurityBody']
  },
  {
    title: 'schemaResourcePrivacyPolicyChoicesTitle',
    paragraphs: ['schemaResourcePrivacyPolicyChoicesBody']
  },
  {
    title: 'schemaResourcePrivacyPolicyUpdatesTitle',
    paragraphs: ['schemaResourcePrivacyPolicyUpdatesBody']
  },
  {
    title: 'schemaResourcePrivacyPolicyContactTitle',
    paragraphs: ['schemaResourcePrivacyPolicyContactBody']
  }
];

function legalSection(section: LegalSection, tr: (key: SchemaMessageKey) => string) {
  return modalSection(tr(section.title), [
    ...section.paragraphs.map((key) => paragraph(tr(key))),
    section.bullets?.length
      ? {
          kind: 'list',
          items: section.bullets.map((key) => tr(key))
        }
      : null
  ]);
}

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const tr = (key: SchemaMessageKey) => translateSchemaMessage(ctx.t, key);
    return {
      id: 'privacy-policy',
      kind: 'modal',
      title: tr('schemaResourcePrivacyPolicyTitle'),
      description: tr('schemaResourcePrivacyPolicyDescription'),
      size: 'large',
      children: [
        resourceModalStack(PRIVACY_POLICY_SECTIONS.map((section) => legalSection(section, tr)))
      ]
    };
  }
};

export default schema;
