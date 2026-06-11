import { describe, expect, it } from 'vitest';
import { createPreviewPlatformServices } from '@platform/preview/services';

describe('preview platform services', () => {
  it('provides inert extension services for preview surfaces', async () => {
    const services = createPreviewPlatformServices();

    expect(await services.messaging.send('demo')).toBeUndefined();
    expect(await services.messaging.sendToTab(1, 'demo')).toBeUndefined();
    expect(services.messaging.addListener(() => undefined)).toEqual(expect.any(Function));

    expect(services.runtime.getURL('/options/index.html')).toBe('/options/index.html');
    await expect(services.runtime.openOptionsPage()).resolves.toBeUndefined();
    expect(services.runtime.getManifest?.()).toEqual({ version: 'preview' });
    expect(services.runtime.onInstalled(() => undefined)).toEqual(expect.any(Function));
    expect(services.runtime.onStartup(() => undefined)).toEqual(expect.any(Function));

    await expect(services.tabs.create({ url: 'about:blank' })).resolves.toBeUndefined();
    await expect(services.tabs.remove(1)).resolves.toBeUndefined();
    await expect(services.tabs.getCurrent()).resolves.toBeUndefined();
    await expect(services.tabs.get(1)).resolves.toBeUndefined();
    await expect(services.tabs.query({ active: true })).resolves.toEqual([]);
    await expect(services.tabs.sendMessage(1, { type: 'demo' })).resolves.toBeUndefined();
    expect(services.tabs.onActivated(() => undefined)).toEqual(expect.any(Function));
    expect(services.tabs.onUpdated(() => undefined)).toEqual(expect.any(Function));
    expect(services.tabs.onRemoved(() => undefined)).toEqual(expect.any(Function));

    await expect(services.contextMenus.create({ id: 'demo', title: 'Demo' })).resolves.toBe(
      'preview'
    );
    await expect(
      services.contextMenus.update('demo', { title: 'Updated' })
    ).resolves.toBeUndefined();
    await expect(services.contextMenus.removeAll()).resolves.toBeUndefined();
    expect(services.contextMenus.onClicked(() => undefined)).toEqual(expect.any(Function));
    expect(services.contextMenus.onShown(() => undefined)).toEqual(expect.any(Function));
    expect(services.contextMenus.refresh?.()).toBeUndefined();

    await expect(
      services.notifications.create('demo', {
        type: 'basic',
        iconUrl: '/icon.png',
        title: 'Demo',
        message: 'Preview'
      })
    ).resolves.toBe('demo');
    await expect(services.notifications.clear('demo')).resolves.toBeUndefined();

    expect(services.action.onClicked(() => undefined)).toEqual(expect.any(Function));
    await expect(services.action.setBadgeText!({ text: '1' })).resolves.toBeUndefined();
    await expect(
      services.action.setBadgeBackgroundColor!({ color: '#000000' })
    ).resolves.toBeUndefined();

    await expect(
      services.scripting.executeScript({ target: { tabId: 1 }, func: () => undefined })
    ).resolves.toEqual([]);
    await expect(
      services.restClient.writeFile(
        { baseUrl: 'https://preview.local', vault: 'Preview', apiKey: '' },
        '/demo.md',
        'content'
      )
    ).resolves.toBeUndefined();
    await expect(
      services.downloads.download({ filename: 'demo.md', url: 'blob:demo' })
    ).resolves.toBeUndefined();
    await expect(
      services.downloads.download({
        filename: 'demo.jpg',
        blob: new Blob(['aaa'], { type: 'image/jpeg' }),
        mimeType: 'image/jpeg'
      })
    ).resolves.toBeUndefined();
  });

  it('reports file-system access as unsupported without pretending to write files', async () => {
    const { fileSystemAccess } = createPreviewPlatformServices();

    expect(fileSystemAccess.isSupported()).toBe(false);
    await expect(fileSystemAccess.queryPermission('vault')).resolves.toBe('unsupported');
    await expect(fileSystemAccess.ensurePermission('vault')).resolves.toBe('unsupported');
    await expect(fileSystemAccess.removeDirectory('vault')).resolves.toBeUndefined();
    await expect(fileSystemAccess.chooseDirectory()).rejects.toThrow('unavailable in preview');
    await expect(
      fileSystemAccess.writeFile({
        folderId: 'vault',
        filePath: 'note.md',
        content: 'content',
        contentType: 'text/markdown'
      })
    ).rejects.toThrow('unavailable in preview');
  });
});
