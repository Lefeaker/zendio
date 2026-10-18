import { expect, it } from 'vitest';
import { downloadPreparedClip } from '../../../src/background/application/downloadClip';
import { prepareVideoClipAttachments } from '../../../src/background/application/videoScreenshotAttachmentPlanner';
import type {
  DownloadTextFileOptions,
  DownloadsService
} from '../../../src/platform/interfaces/downloads';
import type { ClipPayload } from '../../../src/shared/types';

function createDownloads(actualNames: string[]) {
  const writes: DownloadTextFileOptions[] = [];
  const downloads: DownloadsService = {
    onChanged: () => () => undefined,
    download(options) {
      writes.push(options);
      return Promise.resolve({
        state: 'complete',
        id: writes.length,
        filename: `/Downloads/${actualNames[writes.length - 1]}`
      });
    },
    inspect(id) {
      return Promise.resolve({
        state: 'complete',
        exists: true,
        filename: `/Downloads/${actualNames[Number(id) - 1]}`
      });
    }
  };
  return { downloads, writes };
}

function createPayload(fileName: string): ClipPayload {
  return {
    markdown: '![a](aiob-attachment:a)\n![ab](aiob-attachment:ab)',
    meta: {
      attachments: ['a', 'ab'].map((id) => ({
        id,
        fileName,
        mimeType: 'image/jpeg',
        content: { encoding: 'base64', data: 'YQ==', byteLength: 1 }
      }))
    }
  };
}

it.each([
  ['Review#1 % 中文 (notes).md', '图 #% (a).jpg', 'Review#1 _ 中文 (notes)', '图 #_ (a)'],
  ['Review#1.md', 'shot.jpg', 'Review#1', 'shot']
])('uses actual native names and exact IDs for %s', async (filePath, fileName, directory, leaf) => {
  const payload = createPayload(fileName);
  const actualNames = [`${directory}/${leaf} (1).jpg`, `${directory}/${leaf}-2.jpg`, filePath];
  const { downloads, writes } = createDownloads(actualNames);
  await downloadPreparedClip({
    downloads,
    filePath,
    sourceMarkdown: payload.markdown,
    prepared: prepareVideoClipAttachments({
      payload,
      notePath: filePath,
      destination: 'downloads'
    }),
    completeStage: (_stage, action) => action()
  });
  const markdown = writes.at(-1)?.content ?? '';
  const references = [...markdown.matchAll(/!\[[^\]]*\]\(([^)]+)\)/gu)].map((match) => match[1]);
  expect(references).toHaveLength(2);
  expect(markdown).not.toContain('aiob-attachment:');
  expect(
    references.map((reference) => {
      const url = new URL(reference, 'file:///Downloads/note.md');
      expect(url.hash).toBe('');
      return decodeURIComponent(url.pathname).slice('/Downloads/'.length);
    })
  ).toEqual(actualNames.slice(0, 2));
});

it('retains custom URL query and fragment semantics while updating native names', async () => {
  const payload = createPayload('shot.jpg');
  payload.type = 'video';
  const { downloads, writes } = createDownloads([
    'shots/shot (1).jpg',
    'shots/shot-2.jpg',
    'note.md'
  ]);
  await downloadPreparedClip({
    downloads,
    filePath: 'note.md',
    sourceMarkdown: payload.markdown,
    prepared: prepareVideoClipAttachments({
      payload,
      notePath: 'note.md',
      destination: 'downloads',
      screenshotAttachmentOptions: {
        locationTemplate: 'shots',
        fileNameTemplate: '${originalAttachmentFileName}',
        markdownUrlFormat:
          'https://cdn.test/${generatedAttachmentFilePath}?file=pre-${generatedAttachmentFileName}.cache&literal=shot.jpg&keep=%2F#view'
      }
    }),
    completeStage: (_stage, action) => action()
  });
  expect(writes.at(-1)?.content).toBe(
    '![a](https://cdn.test/shots/shot%20%281%29.jpg?file=pre-shot%20%281%29.jpg.cache&literal=shot.jpg&keep=%2F#view)\n![ab](https://cdn.test/shots/shot-2.jpg?file=pre-shot-2.jpg.cache&literal=shot.jpg&keep=%2F#view)'
  );
});

it('replaces punctuation-bearing prefix IDs from the complete final reference map', async () => {
  const payload = createPayload('shot.jpg');
  const second = payload.meta?.attachments?.[1];
  if (!second) throw new Error('Second fixture attachment missing');
  second.id = 'a)b';
  payload.markdown = '![first](aiob-attachment:a)\n![second](aiob-attachment:a)b)';
  const { downloads, writes } = createDownloads(['note/shot.jpg', 'note/shot-2.jpg', 'note.md']);
  await downloadPreparedClip({
    downloads,
    filePath: 'note.md',
    sourceMarkdown: payload.markdown,
    prepared: prepareVideoClipAttachments({
      payload,
      notePath: 'note.md',
      destination: 'downloads'
    }),
    completeStage: (_stage, action) => action()
  });
  expect(writes.at(-1)?.content).toBe('![first](note/shot.jpg)\n![second](note/shot-2.jpg)');
});

it('still refuses an attachment moved into an unrelated directory', async () => {
  const payload = createPayload('shot.jpg');
  const { downloads, writes } = createDownloads(['unrelated/shot.jpg']);
  await expect(
    downloadPreparedClip({
      downloads,
      filePath: 'note.md',
      sourceMarkdown: payload.markdown,
      prepared: prepareVideoClipAttachments({
        payload,
        notePath: 'note.md',
        destination: 'downloads'
      }),
      completeStage: (_stage, action) => action()
    })
  ).rejects.toThrow('outside its requested folder');
  expect(writes).toHaveLength(1);
});
