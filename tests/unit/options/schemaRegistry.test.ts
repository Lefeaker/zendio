import { describe, expect, it } from 'vitest';
import { DEFAULT_OPTIONS } from '@shared/config';
import type { CompleteOptions } from '@shared/types/options';
import {
  createResourceSchemas,
  createSchemaShellAppData,
  createSettingsSchemas
} from '@options/schema/registry';
import { createThemeSegmentedSwitch } from '@options/schema/helpers/settings';
import type { Messages } from '@i18n/messages';
import type { SchemaShellAppData, SchemaShellState } from '@options/schema/model';
import type { SettingsSchema, ResourceSchema } from '@options/schema-runtime';

function createSchemaContext(): {
  state: SchemaShellState;
  appData: SchemaShellAppData;
} {
  const options = structuredClone(DEFAULT_OPTIONS) as CompleteOptions;

  return {
    state: {
      activePanel: 'overview',
      activeResource: null,
      language: 'en',
      options,
      readingPathMode: 'article',
      yamlFilter: 'all',
      activeTemplateField: 'article',
      transferLogMessage: null,
      diagnosisVisible: false,
      diagnosisOutput: ''
    },
    appData: createSchemaShellAppData(null)
  };
}

function findSettingsSchema(id: string): SettingsSchema<SchemaShellState, SchemaShellAppData> {
  const schema = createSettingsSchemas(null).find((item) => item.id === id);
  expect(schema).toBeDefined();
  return schema!;
}

function findResourceSchema(id: string): ResourceSchema<SchemaShellState, SchemaShellAppData> {
  const schema = createResourceSchemas(null).find((item) => item.id === id);
  expect(schema).toBeDefined();
  return schema!;
}

function createMarkerMessages(): Messages {
  return new Proxy(
    {},
    {
      get(_target, property) {
        return `__${String(property)}__`;
      }
    }
  ) as Messages;
}

function getObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function getChildren(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  const node = getObject(value);
  return Array.isArray(node?.children) ? node.children : [];
}

function getChild(value: unknown, index: number): unknown {
  return getChildren(value)[index];
}

function getClassName(value: unknown): string | undefined {
  const node = getObject(value);
  return typeof node?.className === 'string' ? node.className : undefined;
}

function getStringProperty(value: unknown, key: string): string | undefined {
  const node = getObject(value);
  const property = node?.[key];
  return typeof property === 'string' ? property : undefined;
}

function getAction(value: unknown): Record<string, unknown> | null {
  return getObject(getObject(value)?.action);
}

describe('options schema registry', () => {
  it('keeps the formal settings IA order stable', () => {
    expect(createSettingsSchemas(null).map((schema) => schema.id)).toEqual([
      'overview',
      'storage',
      'capture-sources',
      'capture-behavior',
      'output',
      'experimental',
      'maintenance'
    ]);
  });

  it('keeps resource open modes aligned with the shell contract', () => {
    const resourceModes = createResourceSchemas(null).map((schema) => ({
      id: schema.id,
      openMode: schema.openMode
    }));

    expect(resourceModes).toEqual([
      { id: 'onboarding', openMode: 'page' },
      { id: 'plugin-setup', openMode: 'modal' },
      { id: 'support', openMode: 'modal' },
      { id: 'suggestions', openMode: 'modal' },
      { id: 'contact', openMode: 'modal' },
      { id: 'changelog', openMode: 'modal' }
    ]);
  });

  it('uses translated messages for app data and schema metadata when provided', () => {
    const messages = createMarkerMessages();
    const appData = createSchemaShellAppData(messages);
    const settingsSchemas = createSettingsSchemas(messages);
    const resourceSchemas = createResourceSchemas(messages);

    expect(appData.settingsGroupTitle).toBe('__schemaSidebarSettingsGroupTitle__');
    expect(appData.nav[0]).toEqual({
      id: 'overview',
      label: '__schemaOverviewTitle__',
      hint: '__schemaNavOverviewHint__'
    });
    expect(appData.resources[0]?.title).toBe('__schemaResourcesGroupTitle__');
    expect(appData.resources[0]?.items[0]).toEqual({
      id: 'onboarding',
      label: '__schemaResourceOnboardingTitle__',
      hint: '__schemaResourceOnboardingHint__'
    });
    expect(appData.yamlFilterOptions[0]?.label).toBe('__schemaYamlFilterAllLabel__');
    expect(appData.readingPathModes[2]?.label).toBe('__schemaReadingPathModeCustomLabel__');

    expect(settingsSchemas[0]).toEqual(
      expect.objectContaining({
        navLabel: '__schemaOverviewTitle__',
        navHint: '__schemaNavOverviewHint__'
      })
    );
    expect(resourceSchemas[1]).toEqual(
      expect.objectContaining({
        label: '__schemaResourcePluginSetupTitle__',
        hint: '__schemaResourcePluginSetupHint__'
      })
    );
  });

  it('keeps capture-source shell semantics on formal helper class slots', () => {
    const context = createSchemaContext();
    const captureSourcesView = findSettingsSchema('capture-sources').createView(context);
    const aiChatCard = getChild(getChild(captureSourcesView.children, 0), 0);
    const aiChatStack = getChild(aiChatCard, 0);
    const aiPlatformShell = getChild(aiChatStack, 0);
    const aiPlatformLinks = getChild(aiPlatformShell, 1);
    const firstAiPlatformLink = getChild(aiPlatformLinks, 0);
    const deepResearchCard = getChild(getChild(captureSourcesView.children, 1), 0);
    const deepResearchAction = getChild(deepResearchCard, 0);
    const deepResearchNotice = getChild(deepResearchCard, 1);

    expect(getClassName(aiPlatformShell)).toBe('schema-settings-ai-platform-shell');
    expect(getClassName(aiPlatformLinks)).toContain('ai-platform-link-row');
    expect(getClassName(firstAiPlatformLink)).toContain('ai-platform-link');
    expect(getClassName(deepResearchAction)).toBe('deep-research-title-inline');
    expect(getClassName(deepResearchNotice)).toContain('purify-mode-notice');
  });

  it('keeps resource modal composition on formal helper class slots', () => {
    const context = createSchemaContext();
    const supportView = findResourceSchema('support').createView(context);
    const channelsGroup = getChild(supportView.children, 0);
    const firstChannelCard = getChild(channelsGroup, 0);
    const firstChannelLink = getChild(firstChannelCard, 0);

    expect(getClassName(channelsGroup)).toBe('resource-modal-section');
    expect(getClassName(firstChannelCard)).toBe('resource-modal-stack');
    expect(getClassName(firstChannelLink)).toContain('schema-resource-link-card');
  });

  it('keeps the theme segmented helper on formal shell class slots for Task 3 mounting', () => {
    const themeSwitch = createThemeSegmentedSwitch<SchemaShellState, SchemaShellAppData>({
      title: 'Theme',
      description: 'Switch preview shell mode',
      options: [
        { label: 'Dark', value: 'dark' },
        { label: 'Light', value: 'light' }
      ],
      getValue: () => 'dark',
      actionId: 'theme:setMode'
    });
    const control = getObject(themeSwitch)?.control;
    const darkOption = getChild(control, 0);
    const lightOption = getChild(control, 1);

    expect(getClassName(themeSwitch)).toBe('schema-settings-theme-segmented');
    expect(getClassName(control)).toBe('schema-settings-theme-track');
    expect(getStringProperty(darkOption, 'kind')).toBe('button');
    expect(getAction(darkOption)?.id).toBe('theme:setMode');
    expect(getAction(darkOption)?.args).toEqual(['dark']);
    expect(getAction(lightOption)?.args).toEqual(['light']);
  });
});
