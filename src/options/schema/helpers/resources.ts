import type { Messages } from '@i18n';
import type { NodeSchema } from '@options/schema-runtime';
import { resolveSchemaMessage, resolveSchemaMessageList } from '../content';
import type { SchemaShellAppData, SchemaShellState } from '../model';
import { joinSchemaClassNames, schemaClassNames } from './classNames';

type SchemaNode = NodeSchema<SchemaShellState, SchemaShellAppData>;

export function createResourceModalSection(title: string, children: SchemaNode[]): SchemaNode {
  return {
    kind: 'group',
    className: schemaClassNames.resource.modalSection,
    title,
    children
  };
}

export function createResourceModalCard(children: SchemaNode[]): SchemaNode {
  return {
    kind: 'card',
    className: schemaClassNames.resource.modalStack,
    children
  };
}

export function createResourceTextList(
  messages: Messages | null,
  keys: readonly (keyof Messages)[]
): SchemaNode {
  return {
    kind: 'element',
    tag: 'ul',
    className: schemaClassNames.resource.list,
    children: resolveSchemaMessageList(messages, keys).map((item) => ({
      kind: 'element' as const,
      tag: 'li' as const,
      text: item
    }))
  };
}

export function createResourceLinkCard(
  messages: Messages | null,
  titleKey: keyof Messages,
  bodyKey: keyof Messages,
  href?: string,
  noteKey?: keyof Messages
): SchemaNode {
  const note = noteKey ? resolveSchemaMessage(messages, noteKey) : null;
  const tag = href ? 'a' : 'div';

  return createResourceModalCard([
    {
      kind: 'element',
      tag,
      className: joinSchemaClassNames(
        schemaClassNames.resource.linkCard,
        href ? '' : schemaClassNames.resource.linkCardStatic
      ),
      ...(href
        ? {
            attrs: {
              href,
              target: '_blank',
              rel: 'noopener noreferrer'
            }
          }
        : {}),
      children: [
        {
          kind: 'element',
          tag: 'strong',
          text: resolveSchemaMessage(messages, titleKey)
        },
        {
          kind: 'element',
          tag: 'span',
          text: resolveSchemaMessage(messages, bodyKey)
        },
        note
          ? {
              kind: 'element',
              tag: 'small',
              text: note
            }
          : null
      ]
    }
  ]);
}
