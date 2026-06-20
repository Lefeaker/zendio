import type { ResourceSchema } from '../../types';
import { htmlParagraph, paragraph } from '../builders/primitives';
import { modalSection, resourceModalStack } from '../builders/resources';
import { translateSchemaMessage, type SchemaMessageKey } from '../i18n';

interface LegalSection {
  title: SchemaMessageKey;
  paragraphs: SchemaMessageKey[];
  bullets?: SchemaMessageKey[];
  paragraphFormat?: 'text' | 'html';
}

const TERMS_SECTIONS: LegalSection[] = [
  {
    title: 'schemaResourceTermsEffectiveTitle',
    paragraphs: ['schemaResourceTermsEffectiveBody']
  },
  {
    title: 'schemaResourceTermsAcceptanceTitle',
    paragraphs: ['schemaResourceTermsAcceptanceBody']
  },
  {
    title: 'schemaResourceTermsProductTitle',
    paragraphs: ['schemaResourceTermsProductBody']
  },
  {
    title: 'schemaResourceTermsLocalFirstTitle',
    paragraphs: ['schemaResourceTermsLocalFirstBody']
  },
  {
    title: 'schemaResourceTermsUserResponsibilityTitle',
    paragraphs: ['schemaResourceTermsUserResponsibilityBody'],
    bullets: [
      'schemaResourceTermsUserResponsibilityBulletContent',
      'schemaResourceTermsUserResponsibilityBulletDestinations',
      'schemaResourceTermsUserResponsibilityBulletThirdParty',
      'schemaResourceTermsUserResponsibilityBulletSecurity'
    ]
  },
  {
    title: 'schemaResourceTermsThirdPartyTitle',
    paragraphs: ['schemaResourceTermsThirdPartyBody']
  },
  {
    title: 'schemaResourceTermsPrivacyTitle',
    paragraphs: ['schemaResourceTermsPrivacyBody']
  },
  {
    title: 'schemaResourceTermsAvailabilityTitle',
    paragraphs: ['schemaResourceTermsAvailabilityBody']
  },
  {
    title: 'schemaResourceTermsLiabilityTitle',
    paragraphs: ['schemaResourceTermsLiabilityBody']
  },
  {
    title: 'schemaResourceTermsChangesTitle',
    paragraphs: ['schemaResourceTermsChangesBody']
  },
  {
    title: 'schemaResourceTermsContactTitle',
    paragraphs: ['schemaResourceTermsContactBody'],
    paragraphFormat: 'html'
  }
];

function legalSection(section: LegalSection, tr: (key: SchemaMessageKey) => string) {
  const renderParagraph = section.paragraphFormat === 'html' ? htmlParagraph : paragraph;
  return modalSection(tr(section.title), [
    ...section.paragraphs.map((key) => renderParagraph(tr(key))),
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
      id: 'terms-of-use',
      kind: 'modal',
      title: tr('schemaResourceTermsTitle'),
      description: tr('schemaResourceTermsDescription'),
      size: 'large',
      children: [resourceModalStack(TERMS_SECTIONS.map((section) => legalSection(section, tr)))]
    };
  }
};

export default schema;
