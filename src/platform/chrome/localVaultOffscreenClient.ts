import type { WriteLocalVaultFileOptions } from '../interfaces/fileSystemAccess';
import {
  LOCAL_VAULT_OFFSCREEN_PATH,
  LOCAL_VAULT_WRITE_MESSAGE,
  serializeLocalVaultContent,
  type LocalVaultWriteResponse
} from './localVaultOffscreenMessages';

type OffscreenReason = 'LOCAL_STORAGE';

interface OffscreenApi {
  createDocument(options: {
    url: string;
    reasons: OffscreenReason[];
    justification: string;
  }): Promise<void>;
}

interface RuntimeContext {
  contextType?: string;
  documentUrl?: string;
}

interface RuntimeApi {
  getURL(path: string): string;
  getContexts?(filter: {
    contextTypes: string[];
    documentUrls: string[];
  }): Promise<RuntimeContext[]>;
  sendMessage<TResponse = unknown>(message: unknown): Promise<TResponse>;
}

interface ChromeOffscreenApi {
  offscreen?: OffscreenApi;
  runtime?: RuntimeApi;
}

const OFFSCREEN_JUSTIFICATION =
  'Keep the granted local vault directory handle available for user-triggered Obsidian exports.';

let creatingOffscreenDocument: Promise<void> | null = null;

function getChromeOffscreenApi(): ChromeOffscreenApi | null {
  const candidate = (globalThis as unknown as { chrome?: ChromeOffscreenApi }).chrome;
  return candidate?.runtime ? candidate : null;
}

async function hasOffscreenDocument(runtime: RuntimeApi): Promise<boolean> {
  if (typeof runtime.getContexts !== 'function') {
    return false;
  }
  const documentUrl = runtime.getURL(LOCAL_VAULT_OFFSCREEN_PATH);
  const contexts = await runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [documentUrl]
  });
  return contexts.length > 0;
}

export async function ensureLocalVaultOffscreenDocument(): Promise<boolean> {
  const chromeApi = getChromeOffscreenApi();
  const runtime = chromeApi?.runtime;
  const offscreen = chromeApi?.offscreen;
  if (!runtime || !offscreen) {
    return false;
  }

  if (await hasOffscreenDocument(runtime)) {
    return true;
  }

  if (!creatingOffscreenDocument) {
    creatingOffscreenDocument = offscreen
      .createDocument({
        url: LOCAL_VAULT_OFFSCREEN_PATH,
        reasons: ['LOCAL_STORAGE'],
        justification: OFFSCREEN_JUSTIFICATION
      })
      .finally(() => {
        creatingOffscreenDocument = null;
      });
  }

  await creatingOffscreenDocument;
  return true;
}

export async function writeLocalVaultFileInOffscreen(
  options: WriteLocalVaultFileOptions
): Promise<void> {
  const chromeApi = getChromeOffscreenApi();
  const runtime = chromeApi?.runtime;
  if (!runtime || !(await ensureLocalVaultOffscreenDocument())) {
    throw new Error('Local vault offscreen writer is not available.');
  }

  const response = await runtime.sendMessage<LocalVaultWriteResponse>({
    type: LOCAL_VAULT_WRITE_MESSAGE,
    folderId: options.folderId,
    filePath: options.filePath,
    contentType: options.contentType,
    content: await serializeLocalVaultContent(options.content, options.contentType)
  });

  if (!response?.ok) {
    throw new Error(response?.error || 'Local vault offscreen writer failed.');
  }
}
