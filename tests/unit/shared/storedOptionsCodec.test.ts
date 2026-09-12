import { describe, expect, it } from 'vitest';
import {
  STORED_OPTIONS_DELETE,
  applyStoredOptionsPatch,
  decodeStoredOptions,
  encodeStoredOptionsReplacement,
  measureStoredOptionsValueBytes
} from '@shared/config/storedOptionsCodec';
import { DEFAULT_OPTIONS } from '@shared/config/defaultOptions';
import { DEFAULT_TAXONOMY_CONFIG } from '@shared/types/taxonomy';
import type {
  PlainStructuredObject,
  PlainStructuredValue
} from '@shared/config/losslessObjectBoundaryTypes';

function requireMutation(result: ReturnType<typeof applyStoredOptionsPatch>) {
  if (!result.success) {
    throw new Error(`Expected mutation success, got ${result.issues[0]?.code ?? 'unknown'}`);
  }
  return result.value;
}

function requireReplacement(result: ReturnType<typeof encodeStoredOptionsReplacement>) {
  if (!result.success) {
    throw new Error(`Expected replacement success, got ${result.issues[0]?.code ?? 'unknown'}`);
  }
  return result.value;
}

function readPatchedValue(
  root: PlainStructuredObject,
  path: readonly string[]
): PlainStructuredValue | undefined {
  let current: PlainStructuredValue | undefined = root;
  for (const part of path) {
    if (typeof current !== 'object' || current === null || Array.isArray(current)) return undefined;
    current = current[part];
  }
  return current;
}

describe('stored Options codec', () => {
  it('migrates raw aliases before validation and salvages valid siblings per section', () => {
    const decoded = decodeStoredOptions({
      interfaceTheme: 'dark',
      rest: { apiKey: 42, rootDir: 'Legacy/' },
      templates: { clipper: 'Clips/{{title}}.md', article: 'Articles/{{title}}.md' },
      privacyPreferences: { analytics: true, errorReporting: false, debugMode: false }
    });

    expect(decoded.runtime.interfaceTheme).toBe('dark');
    expect(decoded.runtime.templates.fragment).toBe('Clips/{{title}}.md');
    expect(decoded.runtime.templates.reading).toBe('Clips/{{title}}.md');
    expect(decoded.runtime.privacyPreferences?.analytics).toBe(true);
    expect(decoded.runtime.rest).toEqual(DEFAULT_OPTIONS.rest);
    expect(decoded.canonical).not.toHaveProperty('rest');
    expect(decoded.preserved.invalidSections.rest).toEqual({
      apiKey: 42,
      rootDir: 'Legacy/'
    });
    expect(decoded.migrations.map((entry) => entry.stage)).toEqual(['template-clipper']);
    expect(decoded.automaticWritebackIsLossless).toBe(false);
  });

  it('isolates an invalid REST URL while preserving valid and opaque siblings exactly', () => {
    const raw = {
      interfaceTheme: 'light',
      rest: { baseUrl: 'not a url', apiKey: '' },
      templates: { article: 'Articles/{{title}}.md' },
      opaqueExtension: { mode: 'future' }
    };
    const decoded = decodeStoredOptions(raw);

    expect(decoded.canonical).toEqual({
      interfaceTheme: 'light',
      templates: { article: 'Articles/{{title}}.md' }
    });
    expect(decoded.runtime.interfaceTheme).toBe('light');
    expect(decoded.runtime.rest).toEqual(DEFAULT_OPTIONS.rest);
    expect(decoded.preserved.invalidSections.rest).toEqual(raw.rest);
    expect(decoded.preserved.unknownRoots.opaqueExtension).toEqual(raw.opaqueExtension);
    expect(decoded.normalizedRaw).toEqual(raw);
    expect(decoded.automaticWritebackIsLossless).toBe(false);
  });

  it('preserves an own __proto__ unknown root without mutating the collection prototype', () => {
    const decoded = decodeStoredOptions(
      JSON.parse('{"__proto__":{"polluted":"no"},"templates":{"article":"A"}}')
    );
    const unknownRoots = decoded.preserved.unknownRoots;

    expect(Object.prototype.hasOwnProperty.call(unknownRoots, '__proto__')).toBe(true);
    expect(unknownRoots.__proto__).toEqual({ polluted: 'no' });
    expect(Object.getPrototypeOf(unknownRoots)).toBe(Object.prototype);
    expect({}).not.toHaveProperty('polluted');
    expect(JSON.stringify(unknownRoots)).toBe('{"__proto__":{"polluted":"no"}}');

    const roundTripped = decodeStoredOptions(JSON.parse(JSON.stringify(decoded.normalizedRaw)));
    expect(
      Object.prototype.hasOwnProperty.call(roundTripped.preserved.unknownRoots, '__proto__')
    ).toBe(true);
    expect(roundTripped.preserved.unknownRoots.__proto__).toEqual({ polluted: 'no' });
    expect(Object.getPrototypeOf(roundTripped.preserved.unknownRoots)).toBe(Object.prototype);
    expect({}).not.toHaveProperty('polluted');
  });

  it('keeps valid templates available beside malformed nested taxonomy', () => {
    const decoded = decodeStoredOptions({
      templates: { article: 'A', fragment: 'F' },
      classifier: {
        enabled: true,
        taxonomy: {
          version: '1',
          categories: [{ id: 'bad', name: 'Bad', keywords: null }],
          tags: [],
          rules: []
        }
      }
    });

    expect(decoded.runtime.templates.article).toBe('A');
    expect(decoded.runtime.classifier?.taxonomy).toEqual(DEFAULT_OPTIONS.classifier?.taxonomy);
    expect(decoded.preserved.invalidSections).toHaveProperty('classifier');
  });

  it('salvages valid siblings beside malformed YAML and Vault sections', () => {
    const decoded = decodeStoredOptions({
      interfaceTheme: 'light',
      yamlConfig: { contentTypes: { article: { fields: null } } },
      vaultRouter: { vaults: [{ id: 'broken', extraSecret: 'never-report' }] },
      pageSummary: { enabled: true }
    });

    expect(decoded.runtime.interfaceTheme).toBe('light');
    expect(decoded.runtime.pageSummary?.enabled).toBe(true);
    expect(decoded.runtime.yamlConfig).toBeUndefined();
    expect(decoded.runtime.vaultRouter).toBeUndefined();
    expect(decoded.preserved.invalidSections).toHaveProperty('yamlConfig');
    expect(decoded.preserved.invalidSections).toHaveProperty('vaultRouter');
  });

  it('runs template, video, selection, taxonomy, YAML, and Vault migrations in order', () => {
    const decoded = decodeStoredOptions({
      rest: {
        baseUrl: 'https://example.com/',
        vault: 'Main',
        apiKey: '',
        rootDir: 'Legacy/'
      },
      templates: { clipper: 'Legacy clip' },
      video: {
        controlBarAutoPauseEnabled: false,
        controlBarCaptureScreenshotEnabled: false
      },
      fragmentClipper: { selectionModifierEnabled: false },
      classifier: { taxonomy: { type: ['article'], topics: ['science'] } },
      yamlConfig: {
        contentTypes: [
          {
            contentType: 'article',
            fields: [{ name: 'title', type: 'text', enabled: false }]
          }
        ]
      },
      vaultRouter: {
        vaults: [
          {
            id: 'main',
            name: 'Main',
            httpsUrl: 'https://example.com/',
            httpUrl: 'http://example.com/',
            vault: 'Main',
            apiKey: ''
          }
        ],
        rules: [
          {
            id: 'r1',
            vaultId: 'main',
            type: 'domain',
            pattern: 'example.com',
            enabled: true,
            priority: 1
          }
        ]
      }
    });

    expect(decoded.runtime.video?.controlBarAutoPause).toBe(false);
    expect(decoded.runtime.video?.controlBarScreenshot).toBe(false);
    expect(decoded.runtime.fragmentClipper?.selectionTriggerMode).toBe('direct');
    expect(decoded.runtime.classifier?.taxonomy.name).toBe('Migrated Taxonomy');
    expect(decoded.runtime.yamlConfig?.contentTypes?.article?.fields?.[0]?.enabled).toBe(false);
    expect(decoded.runtime.vaultRouter?.vaults[0]?.rules?.[0]?.id).toBe('r1');
    expect(decoded.migrationVersion).toBe(1);
    expect(decoded.migrations.every((entry) => entry.version === decoded.migrationVersion)).toBe(
      true
    );
    expect(decoded.migrations.map((entry) => entry.stage)).toEqual([
      'root-rest',
      'template-clipper',
      'video-aliases',
      'selection-trigger',
      'taxonomy',
      'yaml-vault',
      'yaml-vault'
    ]);
    expect(decoded.automaticWritebackIsLossless).toBe(true);
  });

  it('F04 normalizes duplicate Vault identity before folding legacy rules', () => {
    const duplicateId = 'shared';
    const compatibilityCollision = 'shared~legacy-duplicate-2';
    const decoded = decodeStoredOptions({
      vaultRouter: {
        defaultVaultId: duplicateId,
        vaults: [
          {
            id: duplicateId,
            name: 'Canonical',
            httpsUrl: 'https://canonical.example.com/',
            httpUrl: 'http://canonical.example.com/',
            vault: 'Canonical',
            apiKey: '',
            rules: []
          },
          {
            id: duplicateId,
            name: 'Duplicate',
            httpsUrl: 'https://duplicate.example.com/',
            httpUrl: 'http://duplicate.example.com/',
            vault: 'Duplicate',
            apiKey: '',
            rules: [
              {
                id: 'nested-duplicate',
                vaultId: duplicateId,
                type: 'domain',
                pattern: 'nested.example.com',
                enabled: true,
                priority: 10
              }
            ]
          },
          {
            id: compatibilityCollision,
            name: 'Existing collision',
            httpsUrl: 'https://collision.example.com/',
            httpUrl: 'http://collision.example.com/',
            vault: 'Collision',
            apiKey: '',
            rules: []
          },
          {
            id: 'unique',
            name: 'Unique',
            httpsUrl: 'https://unique.example.com/',
            httpUrl: 'http://unique.example.com/',
            vault: 'Unique',
            apiKey: '',
            rules: []
          }
        ],
        rules: [
          {
            id: 'legacy-ambiguous',
            vaultId: duplicateId,
            type: 'keyword',
            pattern: 'canonical',
            enabled: true,
            priority: 20
          },
          {
            id: 'legacy-unique',
            vaultId: 'unique',
            type: 'keyword',
            pattern: 'unique',
            enabled: true,
            priority: 5
          }
        ]
      }
    });

    const router = decoded.runtime.vaultRouter;
    expect(router?.vaults.map(({ id }) => id)).toEqual([
      duplicateId,
      'shared~legacy-duplicate-2-2',
      compatibilityCollision,
      'unique'
    ]);
    expect(router?.defaultVaultId).toBe(duplicateId);
    expect(router?.vaults[0]?.rules?.map(({ id }) => id)).toContain('legacy-ambiguous');
    expect(router?.vaults[1]?.rules?.[0]).toMatchObject({
      id: 'nested-duplicate',
      vaultId: 'shared~legacy-duplicate-2-2'
    });
    expect(router?.vaults[3]?.rules?.map(({ id }) => id)).toContain('legacy-unique');
    expect(decoded.migrations.map(({ stage, code }) => ({ stage, code }))).toEqual([
      { stage: 'vault-identity', code: 'legacy-duplicate-vault-ids-normalized' },
      { stage: 'yaml-vault', code: 'legacy-vault-rules-migrated' }
    ]);
    expect(decoded.automaticWritebackIsLossless).toBe(true);

    const repeated = decodeStoredOptions(decoded.normalizedRaw);
    expect(repeated.normalizedRaw).toEqual(decoded.normalizedRaw);
    expect(repeated.migrations).toEqual([]);
  });

  it('F04 preserves legacy-first rule collisions while normalizing duplicate Vault identity', () => {
    const decoded = decodeStoredOptions({
      vaultRouter: {
        defaultVaultId: 'shared',
        vaults: [
          {
            id: 'shared',
            name: 'Canonical',
            httpsUrl: 'https://canonical.example.com/',
            httpUrl: 'http://canonical.example.com/',
            vault: 'Canonical',
            apiKey: '',
            rules: [
              {
                id: 'same-rule',
                vaultId: 'shared',
                type: 'domain',
                pattern: 'nested-ignored.example.com',
                enabled: true,
                priority: 5
              }
            ]
          },
          {
            id: 'shared',
            name: 'Duplicate',
            httpsUrl: 'https://duplicate.example.com/',
            httpUrl: 'http://duplicate.example.com/',
            vault: 'Duplicate',
            apiKey: '',
            rules: []
          }
        ],
        rules: [
          {
            id: 'same-rule',
            vaultId: 'shared',
            type: 'domain',
            pattern: 'legacy-first.example.com',
            enabled: true,
            priority: 100
          }
        ]
      }
    });

    expect(decoded.runtime.vaultRouter?.defaultVaultId).toBe('shared');
    expect(decoded.runtime.vaultRouter?.vaults.map(({ id }) => id)).toEqual([
      'shared',
      'shared~legacy-duplicate-2'
    ]);
    expect(decoded.runtime.vaultRouter?.rules).toMatchObject([
      { id: 'same-rule', pattern: 'legacy-first.example.com', priority: 100 }
    ]);
    expect(decoded.runtime.vaultRouter?.vaults[0]?.rules).toMatchObject([
      { id: 'same-rule', pattern: 'nested-ignored.example.com', priority: 5 }
    ]);
    expect(decoded.preserved.invalidSections).not.toHaveProperty('vaultRouter');
    expect(decoded.migrations.map(({ stage, code }) => ({ stage, code }))).toEqual([
      { stage: 'vault-identity', code: 'legacy-duplicate-vault-ids-normalized' }
    ]);
    expect(decoded.automaticWritebackIsLossless).toBe(true);

    const repeated = decodeStoredOptions(decoded.normalizedRaw);
    expect(repeated.normalizedRaw).toEqual(decoded.normalizedRaw);
    expect(repeated.migrations).toEqual([]);
  });

  it('F04 rejects duplicate explicit Vault identity on a new whole-section patch', () => {
    const duplicate = {
      id: 'duplicate',
      name: 'Duplicate',
      httpsUrl: 'https://duplicate.example.com/',
      httpUrl: 'http://duplicate.example.com/',
      vault: 'Duplicate',
      apiKey: ''
    };

    expect(
      applyStoredOptionsPatch(
        {},
        {
          path: ['vaultRouter'],
          value: { defaultVaultId: duplicate.id, vaults: [duplicate, { ...duplicate }] }
        }
      ).success
    ).toBe(false);
  });

  it('leaves unrecognized or invalid legacy values structurally unchanged', () => {
    const invalidYaml = {
      contentTypes: [
        {
          contentType: 'article',
          fields: [{ name: 'title', type: 'text', enabled: true, unknownNested: true }]
        }
      ]
    };
    const invalidTaxonomy = '{"type":[42]}';
    const decoded = decodeStoredOptions({
      templates: { clipper: 42 },
      video: { controlBarAutoPauseEnabled: 'yes' },
      fragmentClipper: { selectionModifierEnabled: 'yes' },
      classifier: { taxonomy: invalidTaxonomy },
      yamlConfig: invalidYaml
    });

    expect(decoded.normalizedRaw.templates).toEqual({ clipper: 42 });
    expect(decoded.normalizedRaw.video).toEqual({ controlBarAutoPauseEnabled: 'yes' });
    expect(decoded.normalizedRaw.fragmentClipper).toEqual({ selectionModifierEnabled: 'yes' });
    expect(decoded.normalizedRaw.classifier).toEqual({ taxonomy: invalidTaxonomy });
    expect(decoded.normalizedRaw.yamlConfig).toEqual(invalidYaml);
    expect(decoded.migrations).toEqual([]);
    expect(decoded.automaticWritebackIsLossless).toBe(false);
  });

  it('does not partially migrate recognized legacy keys in malformed sections', () => {
    const raw = {
      rest: { rootDir: 'Legacy/', apiKey: { invalid: true } },
      templates: { clipper: 'Legacy clip', unknown: true },
      video: { controlBarAutoPauseEnabled: false, unknown: true },
      fragmentClipper: {
        selectionModifierEnabled: false,
        selectionTriggerMode: 'future-mode'
      },
      classifier: { taxonomy: { type: ['article'] }, unknown: true }
    };

    const decoded = decodeStoredOptions(raw);

    expect(decoded.normalizedRaw).toEqual(raw);
    expect(decoded.migrations).toEqual([]);
    expect(decoded.preserved.invalidSections).toEqual(raw);
    expect(decoded.automaticWritebackIsLossless).toBe(false);
  });

  it('preserves unknown roots and malformed sections across an unrelated field patch', () => {
    const raw = {
      customExtension: { opaque: ['keep', 1] },
      rest: { apiKey: { malformed: true } },
      templates: { article: 'Before' }
    };
    const patched = requireMutation(
      applyStoredOptionsPatch(raw, {
        path: ['templates', 'article'],
        value: 'After'
      })
    );

    expect(patched.customExtension).toEqual(raw.customExtension);
    expect(patched.rest).toEqual(raw.rest);
    expect(patched.templates).toEqual({ article: 'After' });
  });

  it('replaces only a touched malformed section with canonical sparse data', () => {
    const patched = requireMutation(
      applyStoredOptionsPatch(
        {
          rest: { apiKey: { malformed: true }, opaque: 'do not merge' },
          customExtension: { keep: true }
        },
        { path: ['rest', 'apiKey'], value: 'valid-token-123' }
      )
    );

    expect(patched.rest).toEqual({ apiKey: 'valid-token-123' });
    expect(patched.customExtension).toEqual({ keep: true });
  });

  it.each([
    [['interfaceTheme'], 'dark'],
    [['rest', 'baseUrl'], 'https://example.com/'],
    [['rest', 'httpsUrl'], 'https://secure.example.com/'],
    [['rest', 'httpUrl'], 'http://example.com/'],
    [['rest', 'vault'], 'Research'],
    [['rest', 'apiKey'], ''],
    [['rest', 'localFolderId'], 'folder-id'],
    [['rest', 'localFolderName'], 'Folder'],
    [['templates', 'article'], 'Articles/{{title}}.md'],
    [['templates', 'video'], 'Videos/{{title}}.md'],
    [['templates', 'fragment'], 'Fragments/{{title}}.md'],
    [['templates', 'reading'], 'Reading/{{title}}.md'],
    [['templates', 'ai'], 'AI/{{title}}.md'],
    [['aiChat', 'includeTimestamps'], true],
    [['aiChat', 'userName'], 'Researcher'],
    [['deepResearch', 'pureMode'], true],
    [['fragmentClipper', 'useFootnoteFormat'], false],
    [['fragmentClipper', 'captureContext'], true],
    [['fragmentClipper', 'contextLength'], 240],
    [['fragmentClipper', 'contextMode'], 'sentences'],
    [['fragmentClipper', 'selectionTriggerMode'], 'direct'],
    [['fragmentClipper', 'selectionModifierKeys'], ['shift']],
    [['fragmentClipper', 'keyboardShortcutsEnabled'], false],
    [['readingSession', 'exportMode'], 'full'],
    [['readingSession', 'highlightTheme'], 'purple'],
    [['video', 'floatingPromptEnabled'], false],
    [['video', 'promptButtonLabel'], 'Capture'],
    [['video', 'promptShortcut'], 'Alt+C'],
    [['video', 'controlBarAutoPause'], false],
    [['video', 'controlBarScreenshot'], false],
    [['video', 'commentEditorAutoPause'], true],
    [['video', 'promptPosition'], { x: 10, y: 20 }],
    [
      ['video', 'screenshotAttachment'],
      {
        locationTemplate: 'assets',
        fileNameTemplate: 'capture.jpg',
        markdownUrlFormat: '![[capture.jpg]]'
      }
    ],
    [['classifier', 'enabled'], true],
    [['classifier', 'provider'], 'ollama'],
    [['classifier', 'endpoint'], 'https://classifier.example.com/'],
    [['classifier', 'apiKey'], 'classifier-key'],
    [['classifier', 'model'], 'classifier-model'],
    [['classifier', 'taxonomy'], DEFAULT_TAXONOMY_CONFIG],
    [['experimentalAi', 'provider'], 'compatible'],
    [['experimentalAi', 'model'], 'gpt-test'],
    [['experimentalAi', 'apiUrl'], 'https://ai.example.com/'],
    [['experimentalAi', 'apiKey'], 'ai-key'],
    [['pageSummary', 'enabled'], true],
    [['readingOverlaySummary', 'enabled'], true],
    [['subtitleTranslation', 'enabled'], true],
    [['subtitleTranslation', 'targetLanguage'], 'ja'],
    [['privacyPreferences', 'analytics'], true],
    [['privacyPreferences', 'errorReporting'], true],
    [['privacyPreferences', 'debugMode'], true],
    [['domainMappings'], { 'example.com': 'Research' }],
    [['vaultRouter'], { vaults: [] }],
    [['yamlConfig'], null],
    [['video', 'screenshotAttachment', 'locationTemplate'], 'assets/${noteFileName}'],
    [['video', 'screenshotAttachment', 'fileNameTemplate'], 'capture.jpg'],
    [['video', 'screenshotAttachment', 'markdownUrlFormat'], '![[${path}]]']
  ] as const)('applies the declared replace/field strategy at %j', (path, value) => {
    const patched = applyStoredOptionsPatch({}, { path, value });
    expect(patched.success).toBe(true);
    if (patched.success) expect(readPatchedValue(patched.value, path)).toEqual(value);
  });

  it('replaces taxonomy, domain mappings, Vault, and YAML as whole sections', () => {
    const taxonomy = requireMutation(
      applyStoredOptionsPatch(
        {},
        {
          path: ['classifier', 'taxonomy'],
          value: DEFAULT_TAXONOMY_CONFIG
        }
      )
    );
    expect(taxonomy.classifier).toEqual({ taxonomy: DEFAULT_TAXONOMY_CONFIG });

    const mappings = requireMutation(
      applyStoredOptionsPatch(
        {},
        {
          path: ['domainMappings'],
          value: { 'example.com': 'Research' }
        }
      )
    );
    expect(mappings.domainMappings).toEqual({ 'example.com': 'Research' });

    const yaml = requireMutation(
      applyStoredOptionsPatch({}, { path: ['yamlConfig'], value: null })
    );
    expect(yaml).toHaveProperty('yamlConfig', null);

    const vault = requireMutation(
      applyStoredOptionsPatch({}, { path: ['vaultRouter'], value: { vaults: [] } })
    );
    expect(vault.vaultRouter).toEqual({ vaults: [] });
  });

  it('replaces arrays and records and permits only the declared nested screenshot path', () => {
    const arrays = requireMutation(
      applyStoredOptionsPatch(
        { fragmentClipper: { selectionModifierKeys: ['alt'] } },
        { path: ['fragmentClipper', 'selectionModifierKeys'], value: ['shift'] }
      )
    );
    expect(arrays.fragmentClipper).toEqual({ selectionModifierKeys: ['shift'] });

    const records = requireMutation(
      applyStoredOptionsPatch(
        { domainMappings: { 'old.example': 'Old', 'keep.example': 'Keep' } },
        { path: ['domainMappings'], value: { 'new.example': 'New' } }
      )
    );
    expect(records.domainMappings).toEqual({ 'new.example': 'New' });

    const screenshot = requireMutation(
      applyStoredOptionsPatch(
        {
          video: {
            screenshotAttachment: {
              locationTemplate: 'old-location',
              fileNameTemplate: 'old-name',
              markdownUrlFormat: 'old-format'
            }
          }
        },
        {
          path: ['video', 'screenshotAttachment', 'markdownUrlFormat'],
          value: 'new-format'
        }
      )
    );
    expect(screenshot.video).toEqual({
      screenshotAttachment: {
        locationTemplate: 'old-location',
        fileNameTemplate: 'old-name',
        markdownUrlFormat: 'new-format'
      }
    });

    for (const path of [
      ['domainMappings', 'example.com'],
      ['vaultRouter', 'vaults'],
      ['yamlConfig', 'contentTypes'],
      ['classifier', 'taxonomy', 'rules'],
      ['video', 'promptPosition', 'x'],
      ['video', 'screenshotAttachment', 'unsupported']
    ]) {
      expect(applyStoredOptionsPatch({}, { path, value: 'rejected' }).success).toBe(false);
    }
  });

  it('uses only the exact JSON-safe deletion operation', () => {
    const raw = { templates: { article: 'A', video: 'V' }, yamlConfig: null };
    expect(
      requireMutation(
        applyStoredOptionsPatch(raw, {
          path: ['templates', 'article'],
          value: STORED_OPTIONS_DELETE
        })
      ).templates
    ).toEqual({ video: 'V' });
    expect(
      requireMutation(
        applyStoredOptionsPatch(raw, { path: ['yamlConfig'], value: STORED_OPTIONS_DELETE })
      )
    ).not.toHaveProperty('yamlConfig');

    expect(
      applyStoredOptionsPatch(raw, {
        path: ['templates', 'article'],
        value: { $zendio: 'delete', extra: true }
      }).success
    ).toBe(false);
    expect(
      applyStoredOptionsPatch(raw, { path: ['templates', 'article'], value: null }).success
    ).toBe(false);
    expect(
      applyStoredOptionsPatch(raw, { path: ['templates', 'article'], value: undefined }).success
    ).toBe(false);
    expect(
      applyStoredOptionsPatch(raw, { path: ['templates', 'article'], value: Symbol('delete') })
        .success
    ).toBe(false);

    const emptied = requireMutation(
      applyStoredOptionsPatch(
        { video: { screenshotAttachment: { markdownUrlFormat: 'only-value' } } },
        {
          path: ['video', 'screenshotAttachment', 'markdownUrlFormat'],
          value: STORED_OPTIONS_DELETE
        }
      )
    );
    expect(emptied).not.toHaveProperty('video');
  });

  it('never interprets a delete-shaped object recursively inside taxonomy data', () => {
    const taxonomy = {
      version: '1',
      categories: [],
      tags: [],
      rules: [
        {
          id: 'rule',
          name: 'Rule',
          conditions: [],
          actions: [
            {
              type: 'transform',
              target: 'metadata',
              value: 'keep',
              metadata: { literal: STORED_OPTIONS_DELETE }
            }
          ]
        }
      ]
    };
    const patched = requireMutation(
      applyStoredOptionsPatch({}, { path: ['classifier', 'taxonomy'], value: taxonomy })
    );

    expect(patched.classifier).toEqual({ taxonomy });
    expect(
      encodeStoredOptionsReplacement({ templates: { article: STORED_OPTIONS_DELETE } }).success
    ).toBe(false);
  });

  it('strict replacement is all-or-nothing and accepts the shipped empty REST key', () => {
    const valid = requireReplacement(
      encodeStoredOptionsReplacement({
        rest: {
          baseUrl: 'https://example.com/',
          vault: 'Main',
          apiKey: ''
        },
        classifier: { taxonomy: DEFAULT_TAXONOMY_CONFIG }
      })
    );
    expect(valid.rest).toEqual({
      baseUrl: 'https://example.com/',
      vault: 'Main',
      apiKey: ''
    });
    expect(valid.classifier).toEqual({ taxonomy: DEFAULT_TAXONOMY_CONFIG });

    expect(
      encodeStoredOptionsReplacement({
        rest: { baseUrl: 'https://example.com/', nestedUnknown: true }
      }).success
    ).toBe(false);
    expect(encodeStoredOptionsReplacement({ rest: { baseUrl: 'not a url' } }).success).toBe(false);
    expect(
      applyStoredOptionsPatch({}, { path: ['rest', 'baseUrl'], value: 'not a url' }).success
    ).toBe(false);
    expect(encodeStoredOptionsReplacement({ unknownRoot: true }).success).toBe(false);
  });

  it('rejects accessors, cycles, depth and bytes with stable redacted issues', () => {
    const accessor = {};
    Object.defineProperty(accessor, 'rest', {
      enumerable: true,
      get() {
        throw new Error('SECRET_ACCESSOR_VALUE');
      }
    });
    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    let deep: unknown = 'leaf';
    for (let index = 0; index < 40; index += 1) {
      deep = { next: deep };
    }

    const results = [
      encodeStoredOptionsReplacement(accessor),
      encodeStoredOptionsReplacement(cyclic),
      encodeStoredOptionsReplacement({ custom: deep }),
      encodeStoredOptionsReplacement({ rest: { apiKey: 'SECRET_'.repeat(100_000) } })
    ];
    results.forEach((result) => expect(result.success).toBe(false));
    expect(JSON.stringify(results)).not.toContain('SECRET_ACCESSOR_VALUE');
    expect(JSON.stringify(results)).not.toContain('SECRET_SECRET');
  });

  it('never includes API keys, arbitrary taxonomy keys, or user values in issues', () => {
    const secret = 'SUPER_SECRET_API_KEY_VALUE';
    const arbitraryKey = 'private-taxonomy-map-key';
    const decoded = decodeStoredOptions({
      rest: { apiKey: { [secret]: true } },
      classifier: {
        taxonomy: {
          version: '1',
          categories: [],
          tags: [],
          rules: [
            {
              id: 'r',
              name: 'r',
              conditions: [],
              actions: [
                {
                  type: 'transform',
                  target: 'x',
                  value: 'x',
                  metadata: { [arbitraryKey]: () => secret }
                }
              ]
            }
          ]
        }
      }
    });
    const serialized = JSON.stringify(decoded.issues);
    expect(serialized).not.toContain(secret);
    expect(serialized).not.toContain(arbitraryKey);
  });

  it('measures encoded UTF-8 value bytes deterministically', () => {
    const ascii = measureStoredOptionsValueBytes({ templates: { article: 'abc' } });
    const unicode = measureStoredOptionsValueBytes({ templates: { article: '文章' } });
    expect(ascii.success).toBe(true);
    expect(unicode.success).toBe(true);
    if (ascii.success && unicode.success) {
      expect(unicode.bytes).toBeGreaterThan(ascii.bytes);
    }
  });
});
