import type { MessagingService, MessagePayload } from '../../platform/interfaces/messaging';
import type { RuntimeService } from '../../platform/interfaces/runtime';
import type { StorageService } from '../../platform/interfaces/storage';
import type { TabsService } from '../../platform/interfaces/tabs';
import { isObjectRecord } from '../../shared/guards/object';
import {
  createUsageStatsFailureResponse,
  createUsageStatsSuccessResponse,
  USAGE_STATS_MESSAGE_TYPE,
  type UsageStatsErrorCode,
  type UsageStatsRequest
} from '../../shared/types/usageStatsMessages';
import type { CaptureVisibleTabScreenshotResponse } from '../../shared/types/videoScreenshotMessages';
import {
  createClipPipelineDependencies,
  type ClipPipelineDependencies
} from '../pipelines/clipPipeline';
import {
  createBackgroundVideoScreenshotCacheHandler,
  type BackgroundVideoScreenshotCacheHandler
} from '../services/videoScreenshotCacheService';
import type { OptionsMutationCoordinator } from '../services/optionsMutationCoordinator';
import { getUsageStatsStore, UsageStatsStoreError } from '../services/usageStats';
import { handleOptionsMutationMessage } from './optionsMutationMessages';
import {
  isUsageStatsMessageCandidate,
  toMessagePayload,
  type RuntimeMessageSender,
  type RuntimeTabContextPayload
} from './runtimeMessageContracts';
import type { SessionDraftRuntimeDependencies } from './sessionDraftMessages';
import { captureVisibleTabScreenshotForSender } from './visibleTabScreenshot';

export type RuntimeMessageValue = Parameters<typeof isUsageStatsMessageCandidate>[0];

export interface RuntimeMessageListenerDependencies extends SessionDraftRuntimeDependencies {
  messaging: Pick<MessagingService, 'addListener'>;
  clipPipeline: ClipPipelineDependencies;
  openOptionsPage(section?: string): Promise<void>;
  getTabContext(sender: RuntimeMessageSender): Promise<RuntimeTabContextPayload>;
  isTabContextActive(ownerContext: RuntimeMessageSender): Promise<RuntimeTabContextPayload>;
  captureVisibleTabScreenshot(
    sender: RuntimeMessageSender
  ): Promise<CaptureVisibleTabScreenshotResponse>;
  handleVideoScreenshotCacheMessage: BackgroundVideoScreenshotCacheHandler;
  handleOptionsMutationMessage(message: RuntimeMessageValue): Promise<MessagePayload | undefined>;
  handleUsageStatsMessage(message: RuntimeMessageValue): Promise<MessagePayload | undefined>;
}

function isUsageStatsRequest(message: RuntimeMessageValue): message is UsageStatsRequest {
  if (!isObjectRecord(message)) return false;
  const keys = Object.keys(message).sort();
  return (
    keys.length === 3 &&
    keys[0] === 'operation' &&
    keys[1] === 'requestId' &&
    keys[2] === 'type' &&
    message.type === USAGE_STATS_MESSAGE_TYPE &&
    typeof message.requestId === 'string' &&
    message.requestId.length > 0 &&
    message.requestId.length <= 128 &&
    (message.operation === 'get' || message.operation === 'reset')
  );
}

function createUsageStatsRequestHandler() {
  return async (message: RuntimeMessageValue): Promise<MessagePayload | undefined> => {
    if (!isUsageStatsMessageCandidate(message)) return undefined;
    const requestId =
      typeof message === 'object' &&
      message !== null &&
      'requestId' in message &&
      typeof message.requestId === 'string' &&
      message.requestId.length > 0
        ? message.requestId.slice(0, 128)
        : 'invalid-usage-request';
    if (!isUsageStatsRequest(message)) {
      return toMessagePayload(
        createUsageStatsFailureResponse(requestId, 'INVALID_USAGE_STATS_REQUEST')
      );
    }
    try {
      const store = getUsageStatsStore();
      const stats =
        message.operation === 'reset' ? await store.resetStats() : await store.getStats();
      return toMessagePayload(createUsageStatsSuccessResponse(message.requestId, stats));
    } catch (error) {
      const errorCode: UsageStatsErrorCode =
        error instanceof UsageStatsStoreError ? error.code : 'USAGE_STATS_STORAGE_FAILURE';
      return toMessagePayload(createUsageStatsFailureResponse(message.requestId, errorCode));
    }
  };
}

export function createRuntimeMessageListenerDependencies(
  messaging: Pick<MessagingService, 'addListener'>,
  tabs: Pick<TabsService, 'create' | 'get' | 'sendMessage' | 'captureVisibleTab'>,
  runtime: Pick<RuntimeService, 'getURL'>,
  storage: Pick<StorageService, 'local'>,
  sessionDrafts: SessionDraftRuntimeDependencies,
  cacheOptions: { ttlMs?: number; optionsMutationCoordinator?: OptionsMutationCoordinator } = {}
): RuntimeMessageListenerDependencies {
  return {
    ...sessionDrafts,
    messaging,
    clipPipeline: createClipPipelineDependencies(tabs),
    handleVideoScreenshotCacheMessage: createBackgroundVideoScreenshotCacheHandler(
      storage,
      cacheOptions.ttlMs === undefined ? {} : { ttlMs: cacheOptions.ttlMs }
    ),
    handleOptionsMutationMessage: (message) =>
      handleOptionsMutationMessage(cacheOptions.optionsMutationCoordinator, message),
    handleUsageStatsMessage: createUsageStatsRequestHandler(),
    async openOptionsPage(section) {
      const optionsUrl = runtime.getURL('options/index.html');
      const normalizedSection = section?.trim();
      await tabs.create({
        url: normalizedSection ? `${optionsUrl}#${normalizedSection}` : optionsUrl
      });
    },
    async getTabContext(sender) {
      const tabId = typeof sender.tabId === 'number' ? sender.tabId : undefined;
      const frameId = typeof sender.frameId === 'number' ? sender.frameId : undefined;
      let windowId = typeof sender.windowId === 'number' ? sender.windowId : undefined;
      if (windowId === undefined && tabId !== undefined) {
        try {
          windowId = (await tabs.get(tabId))?.windowId;
        } catch {
          windowId = undefined;
        }
      }
      return {
        success: true,
        ...(tabId !== undefined ? { tabId } : {}),
        ...(windowId !== undefined ? { windowId } : {}),
        ...(frameId !== undefined ? { frameId } : {})
      };
    },
    async isTabContextActive(ownerContext) {
      const tabId = typeof ownerContext.tabId === 'number' ? ownerContext.tabId : undefined;
      if (tabId === undefined) return { success: true, active: false };
      try {
        const tab = await tabs.get(tabId);
        const expectedWindowId =
          typeof ownerContext.windowId === 'number' ? ownerContext.windowId : undefined;
        return {
          success: true,
          active:
            tab !== undefined &&
            (expectedWindowId === undefined || tab.windowId === expectedWindowId)
        };
      } catch {
        return { success: true, active: false };
      }
    },
    captureVisibleTabScreenshot(sender) {
      return captureVisibleTabScreenshotForSender(tabs, sender);
    }
  };
}
