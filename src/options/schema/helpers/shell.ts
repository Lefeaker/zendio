import type { Messages } from '@i18n';
import { SCHEMA_NAV_COPY, SCHEMA_RESOURCE_GROUP_COPY, resolveSchemaMessage } from '../content';
import type {
  OptionsSchemaNavItem,
  OptionsSchemaPanelId,
  OptionsSchemaResourceGroup,
  OptionsSchemaResourceId
} from '../model';

export const SETTINGS_ORDER: readonly OptionsSchemaPanelId[] = [
  'overview',
  'storage',
  'capture-sources',
  'capture-behavior',
  'output',
  'experimental',
  'maintenance'
];

export const RESOURCE_ORDER: readonly OptionsSchemaResourceId[] = [
  'onboarding',
  'plugin-setup',
  'support',
  'suggestions',
  'contact',
  'changelog'
];

export function createShellNavItem(
  id: OptionsSchemaPanelId,
  messages: Messages | null
): OptionsSchemaNavItem {
  const copy = SCHEMA_NAV_COPY[id];
  return {
    id,
    label: resolveSchemaMessage(messages, copy.label),
    hint: resolveSchemaMessage(messages, copy.hint)
  };
}

export function createShellResourceGroup(messages: Messages | null): OptionsSchemaResourceGroup {
  return {
    id: SCHEMA_RESOURCE_GROUP_COPY.resources.id,
    title: resolveSchemaMessage(messages, SCHEMA_RESOURCE_GROUP_COPY.resources.title),
    items: RESOURCE_ORDER.map((id) => {
      const copy = SCHEMA_RESOURCE_GROUP_COPY.resources.items[id];
      return {
        id,
        label: resolveSchemaMessage(messages, copy.label),
        hint: resolveSchemaMessage(messages, copy.hint)
      };
    })
  };
}
