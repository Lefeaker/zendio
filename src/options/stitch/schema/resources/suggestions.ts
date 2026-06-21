import type { NodeSchema, ResourceSchema } from '../../types';
import { element, textSpan } from '../builders/primitives';
import { translateSchemaMessage, type SchemaMessageKey } from '../i18n';
import { resourceModalStack } from '../builders/resources';
import { ZENDIO_RESOURCE_LINKS } from '@shared/links/zendioResourceLinks';

function externalLink(label: string, href: string): NodeSchema {
  return element('a', { href, target: '_blank', rel: 'noopener noreferrer' }, [textSpan(label)]);
}

function xiaohongshuPopoverLink(label: string, caption: string): NodeSchema {
  return element(
    'span',
    {
      className: 'resource-inline-popover-host'
    },
    [
      element(
        'button',
        {
          className: 'resource-inline-popover-trigger',
          type: 'button',
          dataset: { role: 'xiaohongshu-feedback-qr-trigger' },
          ariaHaspopup: 'dialog'
        },
        [textSpan(label)]
      ),
      element(
        'span',
        {
          className: 'resource-inline-popover',
          role: 'dialog',
          ariaLabel: label
        },
        [
          element('img', {
            className: 'resource-inline-popover-media',
            src: ZENDIO_RESOURCE_LINKS.xiaohongshuFeedbackQr,
            alt: label
          }),
          element('span', { className: 'resource-inline-popover-caption' }, [textSpan(caption)])
        ]
      )
    ]
  );
}

const schema: ResourceSchema = {
  openMode: 'modal',
  createView(ctx) {
    const resource = ctx.appData.resources.suggestions;
    const contact = ctx.appData.resources.contact;
    const tr = (key: SchemaMessageKey) => translateSchemaMessage(ctx.t, key);
    const github = resource.channels.find((item) => item.href?.includes('github.com'));
    const emailHref =
      contact.entries.find((item) => item.href?.startsWith('mailto:'))?.href ??
      ZENDIO_RESOURCE_LINKS.supportEmail;
    return {
      id: 'suggestions',
      kind: 'modal',
      title: tr('schemaResourceSuggestionsTitle'),
      description: '',
      children: [
        resourceModalStack([
          element('p', { className: 'resource-inline-copy' }, [
            textSpan(tr('schemaResourceSuggestionsDescription')),
            github?.href
              ? externalLink(tr('schemaResourceSuggestionsGithubTitle'), github.href)
              : textSpan(tr('schemaResourceSuggestionsGithubTitle')),
            textSpan(tr('schemaResourceSuggestionsGithubDescription')),
            xiaohongshuPopoverLink(
              tr('schemaResourceSuggestionsXiaohongshuTitle'),
              tr('schemaResourceSuggestionsXiaohongshuQrCaption')
            ),
            textSpan(tr('schemaResourceSuggestionsRedditDescription')),
            externalLink(tr('schemaResourceContactEmailTitle'), emailHref),
            textSpan(tr('schemaResourceSuggestionsXiaohongshuDescription'))
          ])
        ])
      ]
    };
  }
};

export default schema;
