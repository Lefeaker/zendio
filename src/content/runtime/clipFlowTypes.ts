import type { MessagingService } from '../../platform/interfaces/messaging';
import type { AnalyticsSource } from '../../shared/analytics';
import type { ClipAttachment } from '../../shared/types';
import type { ExtractorRegistryApi } from '../extractors/registry';
import type { ContentRuntimeState } from './contentRuntimeState';
import type { ContentSelectionTracker } from './contentSelectionTracker';
import type { SupportProgressReporter } from './supportProgress';

export type ClipAnalyticsSource = Extract<
  AnalyticsSource,
  'menu' | 'toolbar' | 'shortcut' | 'unknown'
>;

export type ClipFlowResult = {
  markdown?: string;
  type?: string;
  meta?: ({ attachments?: ClipAttachment[] } & Record<string, unknown>) | undefined;
};

export interface SelectionPromptLifecycleHandlers {
  onPromptOpened?(): void;
  onPromptSubmitted?(): void;
  onPromptCancelled?(): void;
}

export interface VideoSelectionController {
  handleSelectionClip(
    document: Document,
    url: string,
    selection: Selection,
    promptLifecycle?: SelectionPromptLifecycleHandlers
  ): Promise<ClipFlowResult | null>;
  handleVideoSelectionClip(document: Document, url: string, selection: Selection): Promise<void>;
}

export interface InitClipFlowOptions {
  document: Document;
  messaging: Pick<MessagingService, 'send'>;
  runtimeState: ContentRuntimeState;
  selectionTracker: ContentSelectionTracker;
  selectionController: VideoSelectionController;
  extractorRegistry: ExtractorRegistryApi;
  showSupportProgress?: SupportProgressReporter;
}

export interface ClipFlowHandlers {
  handleClip(): Promise<void>;
  handleAutoSelectionClip(event: MouseEvent): void;
  handleModifierKey(event: KeyboardEvent): void;
  handleWindowBlur(): void;
  handlePrimaryMouseDown(event: MouseEvent): void;
  handleSelectionChange(): void;
  handleSelectStart(event: Event): void;
}
