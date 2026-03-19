import { access, copyFile, mkdir, rm, readFile } from 'fs/promises';
import { constants as fsConstants } from 'fs';
import { dirname, join } from 'path';

export async function pathExists(targetPath) {
  try {
    await access(targetPath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

export async function resolveMessage(value, manifest, distDir) {
  const match = /^__MSG_(.*)__$/.exec(value);
  if (!match) {
    return value;
  }

  const locale = manifest.default_locale;
  if (!locale) {
    return value;
  }

  const messagesPath = join(distDir, '_locales', locale, 'messages.json');

  try {
    const messages = JSON.parse(await readFile(messagesPath, 'utf8'));
    return messages?.[match[1]]?.message ?? value;
  } catch {
    return value;
  }
}

export async function prepareLicenseArtifacts(distDir) {
  const licensesDir = join(distDir, 'licenses');

  if (await pathExists(licensesDir)) {
    await rm(licensesDir, { recursive: true, force: true });
  }

  const licenseMappings = [
    { src: 'LICENSE', dest: join(distDir, 'LICENSE'), required: true },
    { src: 'THIRD_PARTY_NOTICES.md', dest: join(distDir, 'THIRD_PARTY_NOTICES.md'), required: true },
    { src: join('src', 'third_party', 'ai-chat-exporter', 'LICENSE'), dest: join(licensesDir, 'ai-chat-exporter', 'LICENSE'), required: true },
    { src: join('src', 'third_party', 'obsidian-clipper', 'LICENSE'), dest: join(licensesDir, 'obsidian-clipper', 'LICENSE'), required: true },
    { src: join('node_modules', '@mozilla', 'readability', 'LICENSE.md'), dest: join(licensesDir, 'mozilla-readability', 'LICENSE.md'), required: true },
    { src: join('node_modules', 'turndown', 'LICENSE'), dest: join(licensesDir, 'turndown', 'LICENSE'), required: true },
    { src: join('node_modules', '@mixmark-io', 'domino', 'LICENSE'), dest: join(licensesDir, 'mixmark-io-domino', 'LICENSE'), required: true }
  ];

  for (const mapping of licenseMappings) {
    if (!(await pathExists(mapping.src))) {
      const message = `未找到许可文件: ${mapping.src}`;
      if (mapping.required) {
        throw new Error(message);
      } else {
        console.warn(`⚠️  ${message}`);
        continue;
      }
    }

    await mkdir(dirname(mapping.dest), { recursive: true });
    await copyFile(mapping.src, mapping.dest);
  }
}
