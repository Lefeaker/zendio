import { createWriteStream } from 'node:fs';
import { resolve } from 'node:path';
import archiver from 'archiver';

export async function zipDirectory(sourceDir, outputPath, options = {}) {
  const absoluteSource = resolve(sourceDir);
  const absoluteOutput = resolve(outputPath);
  const { ignore = [] } = options;

  await new Promise((resolvePromise, rejectPromise) => {
    const archive = archiver('zip', { zlib: { level: 9 } });
    const output = createWriteStream(absoluteOutput);

    output.on('close', resolvePromise);
    output.on('error', rejectPromise);
    archive.on('error', rejectPromise);

    archive.pipe(output);
    archive.glob('**/*', {
      cwd: absoluteSource,
      dot: true,
      ignore
    });

    archive.finalize().catch(rejectPromise);
  });
}
