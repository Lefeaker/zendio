import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_OPTIONS, getOutputTemplatePreset } from '@shared/config';
import {
  hasConfiguredVaultTarget,
  buildExportDestinationPreview,
  resolveExportPath,
  resolveTemplateKeyForPayloadType,
  toDownloadsFilename,
  type TemplateKey
} from '../../../src/shared/exportDestination';
import type { ClipPayload } from '../../../src/shared/types';

const templateKeyCases: Array<[Pick<ClipPayload, 'type' | 'meta'>, TemplateKey]> = [
  [{ type: 'ai_chat' }, 'ai'],
  [{ type: 'clipper', meta: { readerMode: true } }, 'reading'],
  [{ type: 'clipper' }, 'fragment'],
  [{ type: 'fragment' }, 'fragment'],
  [{ type: 'video' }, 'video'],
  [{ type: 'article' }, 'article']
];

describe('exportDestination path preview', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('previews video paths with the video template used by background writes', () => {
    const minimalPreset = getOutputTemplatePreset('Minimal');
    if (!minimalPreset) {
      throw new Error('Missing Minimal preset');
    }
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-09T20:24:13'));

    const path = resolveExportPath(
      {
        ...minimalPreset.templates,
        video: 'Video/{domain}/{yyyy}/{yyyy}-{mm}-{dd}/{slug}.md'
      },
      {
        markdown: '# video',
        title: '当我以为国内景区审美已经要完蛋了的时候…直到我们来到…',
        type: 'video',
        meta: {
          url: 'https://www.bilibili.com/video/BV129ReB1ExM',
          platform: 'bilibili'
        }
      }
    );

    expect(path).toBe(
      'Video/www.bilibili.com/2026/2026-05-09/当我以为国内景区审美已经要完蛋了的时候…直到我们来到….md'
    );
  });

  it.each(templateKeyCases)(
    'resolves the shared template key for %o payloads',
    (payload, expected) => {
      expect(resolveTemplateKeyForPayloadType(payload)).toBe(expected);
    }
  );

  it.each([
    ['../escape.md', 'escape.md'],
    ['folder/../escape.md', 'escape.md'],
    ['/absolute.md', 'absolute.md'],
    ['.', 'note.md'],
    ['..', 'note.md'],
    ['folder/.hidden.md', '.hidden.md']
  ])('normalizes downloads filename %s to %s', (resolvedPath, expected) => {
    expect(toDownloadsFilename(resolvedPath)).toBe(expected);
  });

  it.each([
    { name: 'no vaults', vaults: [], visible: true },
    {
      name: 'unconfigured row',
      vaults: [{ id: 'test', name: 'Test', vault: 'Test', httpsUrl: '', httpUrl: '', apiKey: '' }],
      visible: true
    },
    {
      name: 'local directory',
      vaults: [
        {
          id: 'test',
          name: 'Test',
          vault: 'Test',
          httpsUrl: '',
          httpUrl: '',
          apiKey: '',
          localFolderId: 'local'
        }
      ],
      visible: false
    },
    {
      name: 'REST configuration',
      vaults: [
        { id: 'test', name: 'Test', vault: 'Test', httpsUrl: '', httpUrl: '', apiKey: 'test-key' }
      ],
      visible: false
    },
    {
      name: 'disabled target',
      vaults: [
        {
          id: 'test',
          name: 'Test',
          vault: 'Test',
          httpsUrl: '',
          httpUrl: '',
          apiKey: 'test-key',
          enabled: false
        }
      ],
      visible: true
    }
  ])('shows the setup link for $name according to configured targets', ({ vaults, visible }) => {
    const preview = buildExportDestinationPreview({
      options: {
        ...DEFAULT_OPTIONS,
        rest: { ...DEFAULT_OPTIONS.rest, vault: '', apiKey: '' },
        vaultRouter: { vaults }
      },
      payload: { title: 'Test', markdown: 'Content', type: 'article' }
    });
    expect(Boolean(preview.setupUrl)).toBe(visible);
    expect(preview.hasConfiguredVault).toBe(!visible);
  });

  it('treats local folder vaults as configured export targets without requiring REST keys', () => {
    expect(
      hasConfiguredVaultTarget({
        rest: {
          baseUrl: '',
          vault: '',
          apiKey: ''
        },
        templates: {
          article: '',
          video: '',
          fragment: '',
          reading: '',
          ai: ''
        },
        domainMappings: {},
        vaultRouter: {
          vaults: [
            {
              id: 'local',
              name: 'Local Vault',
              httpsUrl: '',
              httpUrl: '',
              vault: '',
              apiKey: '',
              localFolderId: 'folder-local',
              localFolderName: 'Local Vault'
            }
          ]
        }
      })
    ).toBe(true);
  });
});
