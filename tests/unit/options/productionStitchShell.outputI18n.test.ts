/* @vitest-environment jsdom */

import { DEFAULT_RUNTIME_MESSAGES } from '@i18n';
import { mountProductionStitchShell } from '@options/app/productionStitchShell';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  asOptionsController,
  createController,
  findCardByTitle,
  queryRequired,
  setupProductionStitchShellTest
} from './productionStitchShell.helpers';

const ENGLISH_SENTINEL_MESSAGES = {
  ...DEFAULT_RUNTIME_MESSAGES,
  schemaOutputTitle: 'Output Hero Sentinel',
  schemaOutputHeroDescription: 'Output hero description sentinel.',
  schemaOutputTemplatesGroupTitle: 'Templates Group Sentinel',
  templateConfigTitle: 'Template Card Sentinel',
  templateConfigHint: 'Template card hint sentinel.',
  articleTemplateLabel: 'Article Path Sentinel',
  articleTemplateHint: 'Article path hint sentinel.',
  fragmentTemplateLabel: 'Fragment Path Sentinel',
  fragmentTemplateHint: 'Fragment path hint sentinel.',
  readingTemplateLabel: 'Reading Path Sentinel',
  readingTemplateHint: 'Reading path hint sentinel.',
  readingTemplateOptionArticle: 'Reading Article Sentinel',
  readingTemplateOptionFragment: 'Reading Fragment Sentinel',
  readingTemplateOptionCustom: 'Reading Custom Sentinel',
  aiTemplateLabel: 'AI Path Sentinel',
  aiTemplateHint: 'AI path hint sentinel.',
  schemaOutputTemplateHelperText: 'Template helper sentinel.',
  schemaOutputDomainMappingsGroupTitle: 'Domain Group Sentinel',
  domainMappingTitle: 'Domain Card Sentinel',
  domainMappingHint: 'Domain card hint sentinel.',
  schemaOutputAddMappingButton: 'Add Mapping Sentinel',
  domainMappingDeleteButton: 'Remove Mapping Sentinel',
  schemaOutputDomainColumnLabel: 'Domain Column Sentinel',
  schemaOutputFolderAliasColumnLabel: 'Alias Column Sentinel',
  schemaOutputDomainNotesColumnLabel: 'Notes Column Sentinel',
  domainMappingDomainPlaceholder: 'domain placeholder sentinel',
  domainMappingNamePlaceholder: 'alias placeholder sentinel',
  schemaOutputYamlGroupTitle: 'YAML Group Sentinel',
  yamlConfigTitle: 'YAML Card Sentinel',
  yamlConfigHint: 'YAML card hint sentinel.',
  schemaOutputYamlHelperText: 'YAML helper sentinel.',
  schemaOutputYamlPreviewSummaryLabel: 'YAML Preview Sentinel',
  yamlFilterAllLabel: 'All Filter Sentinel',
  schemaYamlFilterAllLabel: 'All Filter Sentinel',
  schemaYamlFilterArticleLabel: 'Article Filter Sentinel',
  schemaYamlFilterClipperLabel: 'Clipper Filter Sentinel',
  schemaYamlFilterVideoLabel: 'Video Filter Sentinel',
  schemaYamlFilterAiChatLabel: 'AI Filter Sentinel',
  yamlFieldArticleLabel: 'Article Filter Sentinel',
  yamlFieldClipperLabel: 'Clipper Filter Sentinel',
  yamlFieldVideoLabel: 'Video Filter Sentinel',
  yamlFieldAiLabel: 'AI Filter Sentinel',
  yamlFieldActionsLabel: 'Actions Sentinel'
};

describe('mountProductionStitchShell output i18n', () => {
  beforeEach(setupProductionStitchShellTest);

  it('renders Output hero, templates group copy, and reading path options from English messages', () => {
    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: { domainMappings: {} },
      messages: ENGLISH_SENTINEL_MESSAGES,
      language: 'en'
    });

    expect(document.body.textContent).toContain('Output Hero Sentinel');
    expect(document.body.textContent).toContain('Output hero description sentinel.');
    expect(document.body.textContent).toContain('Templates Group Sentinel');

    const templateCard = findCardByTitle('Template Card Sentinel');
    expect(templateCard.textContent).toContain('Template card hint sentinel.');
    expect(templateCard.textContent).toContain('Template helper sentinel.');

    const readingOptions = Array.from(
      queryRequired<HTMLSelectElement>('.reading-mode-select').options
    ).map((option) => option.textContent?.trim());

    expect(readingOptions).toEqual([
      'Reading Article Sentinel',
      'Reading Fragment Sentinel',
      'Reading Custom Sentinel'
    ]);
  });

  it('renders domain mapping controls and YAML group/filter labels from English messages', () => {
    mountProductionStitchShell({
      controller: asOptionsController(createController()),
      initialOptions: { domainMappings: {} },
      messages: ENGLISH_SENTINEL_MESSAGES,
      language: 'en'
    });

    expect(document.body.textContent).toContain('Domain Group Sentinel');
    expect(document.body.textContent).toContain('YAML Group Sentinel');

    const domainCard = findCardByTitle('Domain Card Sentinel');
    expect(domainCard.textContent).toContain('Domain card hint sentinel.');

    const addMappingButton = queryRequired<HTMLButtonElement>(
      '[data-action-id="domain:add"]',
      domainCard
    );
    expect(addMappingButton.textContent?.trim()).toBe('Add Mapping Sentinel');

    const columnLabels = Array.from(domainCard.querySelectorAll<HTMLTableCellElement>('th')).map(
      (cell) => cell.textContent?.trim()
    );
    expect(columnLabels).toEqual([
      'Domain Column Sentinel',
      'Alias Column Sentinel',
      'Notes Column Sentinel',
      'Actions Sentinel'
    ]);

    const placeholderInputs = Array.from(domainCard.querySelectorAll<HTMLInputElement>('input'));
    expect(placeholderInputs[0]?.placeholder).toBe('domain placeholder sentinel');
    expect(placeholderInputs[1]?.placeholder).toBe('alias placeholder sentinel');

    const removeButton = queryRequired<HTMLButtonElement>('[data-action-id="domain:remove"]');
    expect(removeButton.textContent?.trim()).toBe('Remove Mapping Sentinel');

    const yamlCard = findCardByTitle('YAML Card Sentinel');
    expect(yamlCard.textContent).toContain('YAML card hint sentinel.');
    expect(yamlCard.textContent).toContain('YAML helper sentinel.');
    expect(yamlCard.textContent).toContain('YAML Preview Sentinel');

    const yamlFilters = Array.from(
      document.querySelectorAll<HTMLButtonElement>('.stitch-yaml-filter-row button')
    ).map((button) => button.textContent?.trim());

    expect(yamlFilters).toEqual([
      'All Filter Sentinel',
      'Article Filter Sentinel',
      'Clipper Filter Sentinel',
      'Video Filter Sentinel',
      'AI Filter Sentinel'
    ]);
  });
});
