import type {
  ActionDescriptor,
  NodeSchema,
  SchemaContext,
  SchemaValue
} from '@options/schema-runtime';
import type { SchemaShellAppData, SchemaShellState } from '../model';
import { joinSchemaClassNames, schemaClassNames } from './classNames';

type SchemaNode = NodeSchema<SchemaShellState, SchemaShellAppData>;

export interface SettingsPlatformLink {
  label: string;
  href: string;
}

export function createAiPlatformShell(
  title: string,
  links: readonly SettingsPlatformLink[]
): SchemaNode {
  return {
    kind: 'element',
    tag: 'details',
    className: schemaClassNames.settings.aiPlatformShell,
    children: [
      {
        kind: 'element',
        tag: 'summary',
        className: schemaClassNames.settings.aiPlatformSummary,
        text: title
      },
      {
        kind: 'element',
        tag: 'div',
        className: schemaClassNames.settings.aiPlatformLinkRow,
        children: links.map((link) => ({
          kind: 'element' as const,
          tag: 'a' as const,
          className: joinSchemaClassNames(
            schemaClassNames.common.pill,
            schemaClassNames.settings.aiPlatformLink
          ),
          attrs: {
            href: link.href,
            target: '_blank',
            rel: 'noopener noreferrer'
          },
          text: link.label
        }))
      }
    ]
  };
}

export function createDeepResearchPureModeRow(
  title: string,
  description: string,
  stateText: SchemaValue<string, SchemaShellState, SchemaShellAppData>,
  action: ActionDescriptor
): SchemaNode {
  return {
    kind: 'row',
    className: schemaClassNames.settings.deepResearchTitleInline,
    title,
    description,
    control: {
      kind: 'switch',
      bind: { source: 'state', path: 'options.deepResearch.pureMode' },
      stateText,
      action
    }
  };
}

export function createDeepResearchNotice(title: string, body: string): SchemaNode {
  return {
    kind: 'notice',
    className: joinSchemaClassNames(
      schemaClassNames.common.compactInlineNotice,
      schemaClassNames.settings.purifyModeNotice
    ),
    title,
    body,
    variant: 'warning'
  };
}

export interface ThemeSegmentedOption<State, AppData> {
  label: SchemaValue<string, State, AppData>;
  value: string;
}

export interface ThemeSegmentedSwitchConfig<State, AppData> {
  title: SchemaValue<string, State, AppData>;
  description?: SchemaValue<string, State, AppData>;
  options: readonly ThemeSegmentedOption<State, AppData>[];
  getValue: (ctx: SchemaContext<State, AppData>) => string;
  actionId: string;
}

export function createThemeSegmentedSwitch<State, AppData>(
  config: ThemeSegmentedSwitchConfig<State, AppData>
): NodeSchema<State, AppData> {
  return {
    kind: 'row',
    className: schemaClassNames.settings.themeSegmentedShell,
    title: config.title,
    ...(config.description ? { description: config.description } : {}),
    control: {
      kind: 'element',
      tag: 'div',
      className: schemaClassNames.settings.interfaceThemeGrid,
      children: config.options.map((option) => ({
        kind: 'button' as const,
        label: option.label,
        variant: (ctx) => (config.getValue(ctx) === option.value ? 'primary' : 'ghost'),
        className: (ctx) =>
          joinSchemaClassNames(
            schemaClassNames.settings.themeSegmentedOption,
            config.getValue(ctx) === option.value
              ? schemaClassNames.settings.themeSegmentedOptionActive
              : ''
          ),
        action: {
          id: config.actionId,
          args: [option.value]
        }
      }))
    }
  };
}
