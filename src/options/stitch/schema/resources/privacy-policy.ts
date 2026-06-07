import type { ResourceSchema } from '../../types';
import { paragraph } from '../builders/primitives';
import { modalSection, resourceModalStack } from '../builders/resources';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const resource = ctx.appData.resources.privacyPolicy;
    const shouldLocalize = Boolean(ctx.messages);
    return {
      id: 'privacy-policy',
      kind: 'modal',
      title: shouldLocalize
        ? (ctx.t?.('schemaResourcePrivacyPolicyTitle', 'Privacy Policy') ?? 'Privacy Policy')
        : resource.hero.title,
      description: shouldLocalize
        ? (ctx.t?.(
            'schemaResourcePrivacyPolicyDescription',
            'Learn what the extension processes, what it never collects, and how to disable related capabilities.'
          ) ??
          'Learn what the extension processes, what it never collects, and how to disable related capabilities.')
        : resource.hero.description,
      size: 'large',
      children: [
        shouldLocalize
          ? resourceModalStack([
              modalSection(
                ctx.t?.('errorReportingNotCollectedTitle', 'Not collected:') ?? 'Not collected:',
                [
                  {
                    kind: 'list',
                    items: [
                      ctx.t?.(
                        'errorReportingNotCollectedContent',
                        'Clipped content or page text'
                      ) ?? 'Clipped content or page text',
                      ctx.t?.('errorReportingNotCollectedUrls', 'Exact URLs you visit') ??
                        'Exact URLs you visit',
                      ctx.t?.(
                        'errorReportingNotCollectedPasswords',
                        'Passwords or sensitive form data'
                      ) ?? 'Passwords or sensitive form data',
                      ctx.t?.(
                        'errorReportingNotCollectedPersonal',
                        'Personal identifiable information'
                      ) ?? 'Personal identifiable information'
                    ]
                  }
                ]
              ),
              modalSection(
                ctx.t?.('analyticsConsentTitle', 'Usage analytics') ?? 'Usage analytics',
                [
                  paragraph(
                    ctx.t?.(
                      'analyticsConsentDescription',
                      'Collect anonymized usage metrics to improve the extension. No personal-identifiable information is stored.'
                    ) ??
                      'Collect anonymized usage metrics to improve the extension. No personal-identifiable information is stored.'
                  )
                ]
              ),
              modalSection(
                ctx.t?.('errorReportingConsentTitle', 'Error reporting') ?? 'Error reporting',
                [
                  paragraph(
                    ctx.t?.(
                      'errorReportingConsentDescription',
                      'Automatically send sanitized error reports so we can quickly diagnose issues.'
                    ) ??
                      'Automatically send sanitized error reports so we can quickly diagnose issues.'
                  )
                ]
              ),
              modalSection(
                ctx.t?.('schemaResourcePrivacyLocalConfigTitle', 'Local Configuration') ??
                  'Local Configuration',
                [
                  paragraph(
                    ctx.t?.(
                      'schemaResourcePrivacyLocalConfigBody',
                      'Vault names, routing rules, templates, and imported configuration stay in the current browser profile unless you export them yourself.'
                    ) ??
                      'Vault names, routing rules, templates, and imported configuration stay in the current browser profile unless you export them yourself.'
                  )
                ]
              )
            ])
          : resourceModalStack(
              resource.sections.map((section) =>
                modalSection(section.title, [
                  paragraph(section.body),
                  section.bullets?.length ? { kind: 'list', items: section.bullets } : null
                ])
              )
            )
      ]
    };
  }
};

export default schema;
