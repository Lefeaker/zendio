import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  clipAttachmentPlanId,
  matchesLegacyClipAttachmentPlanId
} from '../../../src/background/application/clipAttachmentPlanId';
import type { ResolvedClipRoute } from '../../../src/background/application/clipRouteResolver';
import { prepareVideoClipAttachments } from '../../../src/background/application/videoScreenshotAttachmentPlanner';
import type { ClipPayload } from '../../../src/shared/types/clip';

function fixture(): { payload: ClipPayload; route: ResolvedClipRoute } {
  const payload: ClipPayload = {
    title: 'Note',
    type: 'video',
    markdown: '![A](aiob-attachment:a)\n![B](aiob-attachment:b)',
    meta: {
      operationId: 'op_attachment1',
      url: 'https://example.com/video',
      attachments: ['a', 'b'].map((id) => ({
        id,
        fileName: `${id}.jpg`,
        mimeType: 'image/jpeg',
        content: { encoding: 'base64', data: id === 'a' ? 'YWFh' : 'YmJi', byteLength: 3 }
      }))
    }
  };
  return {
    payload,
    route: {
      destination: 'downloads',
      filePath: 'note.md',
      restVault: '',
      prepared: prepareVideoClipAttachments({
        payload,
        notePath: 'note.md',
        destination: 'downloads'
      })
    }
  };
}

describe('attachment plan identity', () => {
  afterEach(() => vi.restoreAllMocks());

  it('hashes each exact content sequentially, then a manifest without Base64 payloads', async () => {
    const { payload, route } = fixture();
    const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
    let release = () => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const digest = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
      await held;
      return nativeDigest(...args);
    });
    const pending = clipAttachmentPlanId(payload, route);
    expect(digest).toHaveBeenCalledTimes(1);
    release();
    const result = await pending;
    expect(result).toMatch(/^[a-f0-9]{64}$/u);
    const inputs = digest.mock.calls.map(([, data]) => new TextDecoder().decode(data));
    expect(inputs.slice(0, 2)).toEqual(['YWFh', 'YmJi']);
    expect(inputs).toHaveLength(3);
    expect(inputs[2]).not.toContain('YWFh');
    expect(inputs[2]).not.toContain('YmJi');
    expect(inputs[2]).toContain(createHash('sha256').update('YWFh').digest('hex'));
    expect(await clipAttachmentPlanId(payload, route)).toBe(result);
  });

  const changes: [string, (payload: ClipPayload, route: ResolvedClipRoute) => void][] = [
    [
      'source markdown',
      (payload) => {
        payload.markdown += '\nChanged';
      }
    ],
    [
      'title',
      (payload) => {
        payload.title = 'Changed';
      }
    ],
    [
      'type',
      (payload) => {
        payload.type = 'article';
      }
    ],
    [
      'source URL',
      (payload) => {
        payload.meta = { ...payload.meta, url: 'https://other.test' };
      }
    ],
    [
      'operation',
      (payload) => {
        payload.meta = { ...payload.meta, operationId: 'op_changed1' };
      }
    ],
    [
      'note path',
      (_, route) => {
        route.filePath = 'other.md';
      }
    ],
    [
      'prepared markdown',
      (_, route) => {
        route.prepared.markdown += '\nChanged';
      }
    ],
    [
      'order',
      (_, route) => {
        route.prepared.attachments.reverse();
      }
    ],
    [
      'ID',
      (_, route) => {
        route.prepared.attachments[0].id = 'changed';
      }
    ],
    [
      'file name',
      (_, route) => {
        route.prepared.attachments[0].fileName = 'changed.jpg';
      }
    ],
    [
      'MIME',
      (_, route) => {
        route.prepared.attachments[0].mimeType = 'image/png';
      }
    ],
    [
      'output path',
      (_, route) => {
        route.prepared.attachments[0].outputPath = 'changed.jpg';
      }
    ],
    [
      'Markdown path',
      (_, route) => {
        route.prepared.attachments[0].markdownPath = 'changed.jpg';
      }
    ],
    [
      'Markdown URL',
      (_, route) => {
        route.prepared.attachments[0].markdownUrl = 'https://other.test/a';
      }
    ],
    [
      'bytes',
      (_, route) => {
        route.prepared.attachments[0].content = {
          kind: 'base64',
          binary: { encoding: 'base64', data: 'Y2Nj', byteLength: 3 }
        };
      }
    ],
    [
      'byte length',
      (_, route) => {
        route.prepared.attachments[0].content = {
          kind: 'base64',
          binary: { encoding: 'base64', data: 'YWFh', byteLength: 4 }
        };
      }
    ],
    [
      'content representation',
      (_, route) => {
        route.prepared.attachments[0].content = {
          kind: 'legacyDataUrl',
          dataUrl: 'data:image/jpeg;base64,YWFh'
        };
      }
    ]
  ];
  it.each(changes)('binds %s to the immutable plan', async (_, change) => {
    const { payload, route } = fixture();
    const previous = await clipAttachmentPlanId(payload, route);
    change(payload, route);
    expect(await clipAttachmentPlanId(payload, route)).not.toBe(previous);
  });

  it.each([
    'storageTarget',
    'fallbackReason',
    'localFolderName',
    'vault',
    'localFolderId',
    'baseUrl',
    'httpsUrl',
    'httpUrl'
  ])('binds target field %s', async (field) => {
    const { payload, route } = fixture();
    const vaultRoute: Extract<ResolvedClipRoute, { destination: 'vault' }> = {
      destination: 'vault',
      filePath: route.filePath,
      prepared: route.prepared,
      vault: null,
      restConfig: { vault: 'Vault', apiKey: 'key', baseUrl: 'https://target' },
      writeSession: {
        target: { storageTarget: 'rest-api' },
        writeAttachment: vi.fn(),
        writeMarkdown: vi.fn()
      }
    };
    const before = await clipAttachmentPlanId(payload, vaultRoute);
    if (field === 'storageTarget') vaultRoute.writeSession.target.storageTarget = 'local-folder';
    else if (field === 'fallbackReason')
      vaultRoute.writeSession.target.fallbackReason = 'permission-denied';
    else if (field === 'localFolderName')
      vaultRoute.writeSession.target.localFolderName = 'Changed';
    else vaultRoute.restConfig = { ...vaultRoute.restConfig, [field]: 'Changed' };
    expect(await clipAttachmentPlanId(payload, vaultRoute)).not.toBe(before);
  });

  it('verifies the exact old SHA-256 JSON without accepting changed content', async () => {
    const { payload, route } = fixture();
    const oldId = createHash('sha256')
      .update(
        JSON.stringify({
          markdown: payload.markdown,
          title: payload.title,
          type: payload.type,
          sourceUrl: payload.meta?.url,
          operationId: payload.meta?.operationId,
          target: { storageTarget: 'downloads' },
          filePath: route.filePath,
          prepared: route.prepared
        })
      )
      .digest('hex');
    expect(await clipAttachmentPlanId(payload, route)).not.toBe(oldId);
    expect(await matchesLegacyClipAttachmentPlanId(payload, route, oldId)).toBe(true);
    route.prepared.attachments.reverse();
    expect(await matchesLegacyClipAttachmentPlanId(payload, route, oldId)).toBe(false);
  });

  it.each(['current', 'legacy'])(
    'stops after a late %s digest when its owner cancels',
    async (format) => {
      const { payload, route } = fixture();
      let release = () => {};
      let cancelled = false;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const nativeDigest = crypto.subtle.digest.bind(crypto.subtle);
      const digest = vi.spyOn(crypto.subtle, 'digest').mockImplementationOnce(async (...args) => {
        await held;
        return nativeDigest(...args);
      });
      const checkActive = () => {
        if (cancelled) throw new Error('owner cancelled');
      };
      const pending =
        format === 'current'
          ? clipAttachmentPlanId(payload, route, checkActive)
          : matchesLegacyClipAttachmentPlanId(payload, route, '0'.repeat(64), checkActive);
      expect(digest).toHaveBeenCalledTimes(1);
      cancelled = true;
      release();
      await expect(pending).rejects.toThrow('owner cancelled');
      expect(digest).toHaveBeenCalledTimes(1);
    }
  );
});
