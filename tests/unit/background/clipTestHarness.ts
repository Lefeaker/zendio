import { createMemoryStorageArea } from '../../../src/platform/preview/memoryStorage';
import { TOKENS } from '../../../src/shared/di/tokens';
import type { DownloadsService } from '../../../src/platform/interfaces/downloads';
import { expect, vi, type Mock } from 'vitest';
import type { AppError } from '@shared/errors';
import { ErrorSeverity } from '@shared/errors';
import type { ClipResultMessage } from '@shared/types';
import type { ClipProcessingHooks } from '../../../src/background/application/clipProcessor';

export type ClipProcessingHooksWithProgress = ClipProcessingHooks & {
  onProgress: NonNullable<ClipProcessingHooks['onProgress']>;
};

export type ClipProcessingHooksWithPermission = ClipProcessingHooks & {
  requestLocalVaultPermission: NonNullable<ClipProcessingHooks['requestLocalVaultPermission']>;
};

export type TrackUsageEventMock = (
  eventName: string,
  params?: Record<string, unknown>
) => Promise<void>;
export type TrackUsageEventCall = Parameters<TrackUsageEventMock>;

export const learningStorage = createMemoryStorageArea();
export const getOptionsMock = vi.fn();
export const selectVaultMock = vi.fn();
export const classifyClipMock = vi.fn();
export const resolvePathMock = vi.fn();
export const writeMarkdownMock = vi.fn();
export const writeAttachmentMock = vi.fn();
export const createWriteSessionMock = vi.fn();
export const recordUsageMock = vi.fn();
export const downloadMock = vi.fn<DownloadsService['download']>();
export const inspectDownloadMock = vi.fn<NonNullable<DownloadsService['inspect']>>();
export const onDownloadChangedMock = vi.fn<NonNullable<DownloadsService['onChanged']>>(
  () => () => {}
);
export const trackUsageEventMock = vi.fn<TrackUsageEventMock>();
export const trackActivationMilestoneIfNeededMock = vi.fn(() => Promise.resolve(undefined));
export const notifySuccessMock = vi.fn();
export const notifyFailureMock = vi.fn();
export const notifyWarningMock = vi.fn();
export const sendMessageMock = vi.fn();
export const isPromptSuppressedMock = vi.fn();
export const suppressPromptMock = vi.fn();

const getServiceMock = vi.hoisted(() =>
  vi.fn(() => ({
    storage: { local: learningStorage },
    downloads: {
      download: downloadMock,
      inspect: inspectDownloadMock,
      onChanged: onDownloadChangedMock
    }
  }))
);

export const templateOptions = {
  article: '',
  video: '',
  fragment: '',
  reading: '',
  ai: ''
} as const;

const FORBIDDEN_ANALYTICS_KEYS = new Set([
  'classification_fallback_reason',
  'classification_status',
  'classification_type',
  'createdAt',
  'duration_ms',
  'error_code',
  'fallback_reason',
  'filePath',
  'localFolderName',
  'markdown',
  'messages',
  'model',
  'notePath',
  'restVault',
  'title',
  'url',
  'vaultName'
]);

vi.mock('../../../src/background/store', () => ({
  getOptions: getOptionsMock
}));

vi.mock('../../../src/background/services/vaultRouterService', () => ({
  selectVaultForClip: selectVaultMock
}));

vi.mock('../../../src/background/services/classificationService', () => ({
  classifyClip: classifyClipMock
}));

vi.mock('../../../src/background/pathResolver', () => ({
  resolvePath: resolvePathMock
}));

vi.mock('../../../src/background/services/obsidianWriter', () => ({
  createVaultWriteSession: createWriteSessionMock,
  writeMarkdownToVault: writeMarkdownMock,
  writeAttachmentToVault: writeAttachmentMock
}));

vi.mock('../../../src/background/services/usageStats', () => ({
  recordClipUsage: recordUsageMock
}));

vi.mock('../../../src/background/services/analyticsEvents', () => ({
  trackUsageEvent: trackUsageEventMock,
  trackActivationMilestoneIfNeeded: trackActivationMilestoneIfNeededMock
}));

vi.mock('../../../src/shared/di', () => ({
  getService: getServiceMock,
  TOKENS
}));

vi.mock('../../../src/background/services/notifications', () => ({
  notifyClipSuccess: notifySuccessMock,
  notifyClipFailure: notifyFailureMock,
  notifyClipWarning: notifyWarningMock
}));

vi.mock('../../../src/background/services/localVaultPermissionPrompts', () => ({
  isLocalVaultPermissionPromptSuppressed: isPromptSuppressedMock,
  suppressLocalVaultPermissionPrompt: suppressPromptMock
}));

export function resetClipProcessorHarnessMocks(): void {
  void learningStorage.clear();
  getOptionsMock.mockReset();
  selectVaultMock.mockReset();
  classifyClipMock.mockReset();
  resolvePathMock.mockReset();
  writeMarkdownMock.mockReset();
  writeAttachmentMock.mockReset();
  createWriteSessionMock.mockReset();
  recordUsageMock.mockReset();
  downloadMock.mockReset();
  inspectDownloadMock.mockReset();
  inspectDownloadMock.mockImplementation(() =>
    Promise.resolve({
      state: 'complete',
      filename: downloadMock.mock.lastCall?.[0]?.filename ?? 'note.md'
    })
  );
  onDownloadChangedMock.mockReset();
  onDownloadChangedMock.mockReturnValue(() => {});
  trackUsageEventMock.mockReset();
  trackActivationMilestoneIfNeededMock.mockReset();
  getServiceMock.mockReset();
  getServiceMock.mockReturnValue({
    storage: { local: learningStorage },
    downloads: {
      download: downloadMock,
      inspect: inspectDownloadMock,
      onChanged: onDownloadChangedMock
    }
  });
  createWriteSessionMock.mockResolvedValue({
    target: { storageTarget: 'rest-api' },
    writeMarkdown: writeMarkdownMock,
    writeAttachment: writeAttachmentMock
  });
  trackUsageEventMock.mockResolvedValue(undefined);
}

export function resetClipPipelineHarnessMocks(
  processClipPayloadMock: Mock<(...args: unknown[]) => unknown>
): void {
  getOptionsMock.mockReset();
  notifySuccessMock.mockReset();
  notifyFailureMock.mockReset();
  notifyWarningMock.mockReset();
  processClipPayloadMock.mockReset();
  sendMessageMock.mockReset();
  isPromptSuppressedMock.mockReset();
  suppressPromptMock.mockReset();
  isPromptSuppressedMock.mockResolvedValue(false);
  suppressPromptMock.mockResolvedValue(undefined);
  sendMessageMock.mockResolvedValue(undefined);
  notifySuccessMock.mockResolvedValue(undefined);
  notifyFailureMock.mockResolvedValue(undefined);
  notifyWarningMock.mockResolvedValue(undefined);
}

export function restoreClipProcessorHarnessMocks(): void {
  vi.doUnmock('../../../src/i18n/catalog/runtimeFallbackMessages');
  vi.restoreAllMocks();
}

export function createPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    markdown: '# note',
    title: 'Title',
    type: 'article',
    meta: { url: 'https://example.com' },
    ...overrides
  };
}

export function createClipResultMessage(
  payloadOverrides: Partial<ClipResultMessage['payload']> = {}
): ClipResultMessage {
  return {
    type: 'CLIP_RESULT' as const,
    payload: {
      markdown: '# note',
      title: 'Title',
      type: 'article',
      meta: { url: 'https://example.com/articles/1' },
      ...payloadOverrides
    }
  };
}

export function createAppError(overrides: Partial<AppError> = {}): AppError {
  return {
    code: 'TEST_WARNING',
    domain: 'content',
    message: 'Classifier degraded',
    userMessage: 'Classifier degraded',
    severity: ErrorSeverity.WARNING,
    recoverable: true,
    ...overrides
  };
}

export async function expectDownloadedBlob(
  callIndex: number,
  expectedFilename: string,
  expectedMimeType: string,
  expectedText: string
): Promise<void> {
  const options = downloadMock.mock.calls[callIndex]?.[0] as
    | {
        filename: string;
        mimeType?: string;
        blob?: Blob;
        url?: string;
      }
    | undefined;

  expect(options).toMatchObject({
    filename: expectedFilename,
    mimeType: expectedMimeType
  });
  expect(options?.blob).toBeInstanceOf(Blob);
  expect(options?.url).toBeUndefined();
  await expect(options?.blob?.text()).resolves.toBe(expectedText);
}

export function expectAnalyticsEvent(
  call: TrackUsageEventCall | undefined,
  expectedEvent: string,
  expectedParams: Record<string, unknown>,
  allowedKeys: string[]
): void {
  expect(call).toBeDefined();
  const [eventName, params = {}] = call ?? [];
  expect(eventName).toBe(expectedEvent);
  expect(params).toMatchObject(expectedParams);
  expect(Object.keys(params).sort()).toEqual([...allowedKeys].sort());
  Object.keys(params).forEach((key) => {
    expect(FORBIDDEN_ANALYTICS_KEYS.has(key)).toBe(false);
  });
}

export function expectNoSensitiveValues(
  params: Record<string, unknown> | undefined,
  fragments: string[]
): void {
  const serialized = JSON.stringify(params ?? {});
  fragments.forEach((fragment) => {
    expect(serialized).not.toContain(fragment);
  });
}
