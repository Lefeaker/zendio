import { describe, expect, it } from 'vitest';
import { mergeOptions } from '../../../src/shared/config/optionsMerger';
import { reviewAiConfiguration } from '../../../src/options/ai-configuration/parse';
import { createAiConfigPrompt } from '../../../src/options/ai-configuration/prompt';
import { createPreviewOptionsRepository } from '../../../src/platform/preview/optionsRepository';
import { AiConfigInputError } from '../../../src/options/ai-configuration/types';
import en from '../../../src/i18n/generated/locales/en.generated';

const config = (changes: object) =>
  JSON.stringify({ format: 'zendio-ai-config', version: 1, changes });
function current() {
  return mergeOptions({
    rest: { vault: 'Research', apiKey: 'REST_SECRET_VALUE' },
    vaultRouter: {
      defaultVaultId: 'main',
      vaults: [
        {
          id: 'main',
          name: 'Research',
          vault: 'Research',
          apiKey: 'VAULT_SECRET_VALUE',
          httpsUrl: 'https://example.test/',
          httpUrl: '',
          localFolderId: 'permission-id',
          localFolderName: 'private-directory',
          isDefault: true,
          enabled: true
        }
      ],
      rules: [
        {
          id: 'old',
          vaultId: 'main',
          type: 'domain',
          pattern: 'old.test',
          enabled: true,
          priority: 1
        }
      ]
    },
    yamlConfig: {
      contentTypes: {
        article: {
          customFields: [{ name: 'existing', type: 'text', enabled: true, defaultValue: 'keep' }]
        }
      }
    },
    domainMappings: { 'old.test': 'Keep' }
  });
}

describe('AI configuration contract', () => {
  it('previews only changed fields and accepts one fenced configuration without writing', () => {
    const before = current();
    const snapshot = structuredClone(before);
    const review = reviewAiConfiguration(
      'Here is the configuration:\n```json\n' +
        config({
          'fragmentClipper.selectionModifierKeys': ['alt'],
          'readingSession.exportMode': 'full',
          'fragmentClipper.selectionTriggerMode': 'modifier'
        }) +
        '\n```',
      before
    );
    expect(review.rows.map((row) => row.field)).toEqual([
      'fragmentClipper.selectionModifierKeys',
      'readingSession.exportMode'
    ]);
    expect(review.expected[0]).toEqual({
      path: ['fragmentClipper', 'selectionModifierKeys'],
      value: ['shift']
    });
    expect(before).toEqual(snapshot);
  });
  it('adds collection entries without removing credentials, authorizations or existing entries', async () => {
    const repository = createPreviewOptionsRepository(current());
    const before = await repository.get();
    const review = reviewAiConfiguration(
      config({
        domainMappings: { 'new.test': 'New' },
        'vaultRouter.vaults': [{ id: '$default', name: 'Renamed' }],
        'vaultRouter.rules': [
          {
            id: 'new',
            vaultId: '$default',
            type: 'domain',
            pattern: 'new.test',
            enabled: true,
            priority: 10
          }
        ],
        yamlConfig: {
          contentTypes: {
            article: {
              customFields: [
                { name: 'project', type: 'text', enabled: true, defaultValue: 'Research' }
              ]
            }
          }
        }
      }),
      before
    );
    const saved = await repository.patch(review.patches, review.expected);
    expect(saved.domainMappings).toMatchObject({ 'old.test': 'Keep', 'new.test': 'New' });
    expect(saved.vaultRouter?.vaults[0]).toMatchObject({
      name: 'Renamed',
      vault: 'Renamed',
      apiKey: 'VAULT_SECRET_VALUE',
      localFolderId: 'permission-id'
    });
    expect(saved.rest.apiKey).toBe(before.rest.apiKey);
    expect(
      saved.vaultRouter?.vaults.flatMap((vault) => vault.rules ?? []).map((rule) => rule.id)
    ).toEqual(['old', 'new']);
    expect(
      saved.yamlConfig?.contentTypes?.article?.customFields?.map((field) => field.name)
    ).toEqual(['existing', 'project']);
    expect(JSON.stringify(review.rows)).not.toMatch(/SECRET_VALUE|permission-id|private-directory/);
  });
  it('does not create a default vault for empty collection updates', () => {
    expect(
      reviewAiConfiguration(
        config({ 'vaultRouter.vaults': [], 'vaultRouter.rules': [] }),
        mergeOptions({})
      ).patches
    ).toHaveLength(0);
  });
  it.each([
    { 'rest.apiKey': 'do-not-import' },
    { 'privacyPreferences.analytics': true },
    { 'fragmentClipper.selectionModifierKeys': ['shift', 'alt'] },
    { 'readingSession.exportMode': 'anything' },
    { 'templates.article': 'Notes/{invented}.md' },
    { 'templates.article': '../outside.md' },
    { 'video.screenshotAttachment.fileNameTemplate': '${unknown}.jpg' },
    { 'vaultRouter.vaults': [{ id: '$default', apiKey: 'secret' }] },
    { 'vaultRouter.vaults': [{ id: '$default', enabled: false }] },
    { 'vaultRouter.vaults': null },
    {
      'vaultRouter.rules': [
        { id: 'r', vaultId: 'missing', type: 'domain', pattern: 'x', enabled: true, priority: 1 }
      ]
    },
    {
      'vaultRouter.rules': [
        {
          id: 'r',
          vaultId: '$default',
          type: 'url-pattern',
          pattern: '[',
          enabled: true,
          priority: 1
        }
      ]
    },
    {
      yamlConfig: {
        contentTypes: {
          article: { customFields: [{ name: 'bad field', type: 'text', enabled: true }] }
        }
      }
    }
  ])('rejects unsafe or invalid changes: %j', (changes) => {
    expect(() => reviewAiConfiguration(config(changes), current())).toThrow(AiConfigInputError);
  });
  it('rejects unknown versions, multiple candidates and prototype keys', () => {
    for (const text of [
      '{"format":"zendio-ai-config","version":2,"changes":{}}',
      '```json\n' + config({}) + '\n```\n```json\n' + config({}) + '\n```',
      '{"format":"zendio-ai-config","version":1,"changes":{"domainMappings":{"__proto__":"bad"}}}'
    ])
      expect(() => reviewAiConfiguration(text, current())).toThrow(AiConfigInputError);
  });
  it('generates supported field formats and opt-in public context without connection keys or grants', () => {
    const prompt = createAiConfigPrompt(en.runtime, 'firefox', current());
    expect(prompt).toContain(en.runtime.settingsVaultFirefox);
    expect(prompt).not.toContain(en.runtime.settingsVaultLocal);
    expect(prompt).toContain('fragmentClipper.selectionModifierKeys');
    expect(prompt).toContain('Research');
    expect(prompt).not.toMatch(/SECRET_VALUE|permission-id|private-directory/);
    expect(prompt).not.toContain('pageSummary.enabled');
    expect(createAiConfigPrompt(en.runtime, 'chrome')).not.toContain('old.test');
  });
});
