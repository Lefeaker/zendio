import type { Options } from '../store';
import { writeFile } from '../sinks/obsidianRest';

export async function writeMarkdownToVault(rest: Options['rest'], filePath: string, markdown: string): Promise<void> {
  await writeFile(rest, filePath, markdown);
}
