import type { ResourceSchema } from '../../types';
import { paragraph } from '../builders/primitives';
import { modalSection, resourceModalStack } from '../builders/resources';

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const resource = ctx.appData.resources.dataUsage;
    const shouldLocalize = Boolean(ctx.messages);
    return {
      id: 'data-usage',
      kind: 'modal',
      title: shouldLocalize
        ? (ctx.t?.('schemaResourceDataUsageTitle', 'Data Usage') ?? 'Data Usage')
        : resource.hero.title,
      description: shouldLocalize
        ? (ctx.t?.(
            'schemaResourceDataUsageDescription',
            'Understand how usage metrics, error reports, and configuration transfer features use local or anonymous data.'
          ) ??
          'Understand how usage metrics, error reports, and configuration transfer features use local or anonymous data.')
        : resource.hero.description,
      size: 'large',
      children: [
        shouldLocalize
          ? resourceModalStack([
              modalSection(
                ctx.t?.('schemaResourceDataUsageAnonymousUsageTitle', 'Anonymous Usage Counts') ??
                  'Anonymous Usage Counts',
                [
                  paragraph(
                    ctx.t?.(
                      'schemaResourceDataUsageAnonymousUsageBody',
                      'Usage Dashboard totals are computed from local counters so you can review feature activity at a glance.'
                    ) ??
                      'Usage Dashboard totals are computed from local counters so you can review feature activity at a glance.'
                  )
                ]
              ),
              modalSection(
                ctx.t?.('errorReportingDetailsTitle', 'Learn what is included') ??
                  'Learn what is included',
                [
                  paragraph(
                    ctx.t?.('errorReportingCollectedTitle', 'Collected information:') ??
                      'Collected information:'
                  ),
                  {
                    kind: 'list',
                    items: [
                      ctx.t?.('errorReportingCollectedError', 'Error type and severity') ??
                        'Error type and severity',
                      ctx.t?.('errorReportingCollectedBrowser', 'Browser name and major version') ??
                        'Browser name and major version',
                      ctx.t?.('errorReportingCollectedExtension', 'Extension version') ??
                        'Extension version',
                      ctx.t?.('errorReportingCollectedTimestamp', 'Time the error occurred') ??
                        'Time the error occurred'
                    ]
                  }
                ]
              ),
              modalSection(
                ctx.t?.('schemaResourceDataUsageConfigMigrationTitle', 'Configuration Migration') ??
                  'Configuration Migration',
                [
                  paragraph(
                    ctx.t?.(
                      'schemaResourceDataUsageConfigMigrationBody',
                      'Copy/import tools read configuration JSON from the clipboard, validate it locally, and save the merged result.'
                    ) ??
                      'Copy/import tools read configuration JSON from the clipboard, validate it locally, and save the merged result.'
                  )
                ]
              )
            ])
          : resourceModalStack(
              resource.sections.map((section) =>
                modalSection(section.title, [paragraph(section.body)])
              )
            )
      ]
    };
  }
};

export default schema;
