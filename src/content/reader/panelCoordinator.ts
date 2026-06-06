import type { ReaderPanelCallbacks } from './application/readerPanelModel';
import type { ReaderSessionView, ReaderSessionViewFactory } from './application/readerSessionView';
import type { ExportDestinationSurfacePreview } from '@options/stitch/types';
import type { ReaderHighlightRecord } from './services/highlightManager';
import type { ReaderSessionMessages, ReaderHintState } from './sessionMessages';
import { DEFAULT_SESSION_MESSAGES } from './sessionMessages';
import { ReaderPanelPresenter } from './panelPresenter';
import { ReaderHintManager } from './hintManager';
import type { SessionCommentDraftSnapshot } from '@content/shared/panels/sessionCommentDrafts';

export interface ReaderPanelCoordinatorOptions {
  viewFactory: ReaderSessionViewFactory;
  callbacks: ReaderPanelCallbacks;
  reconstructText: (highlight: ReaderHighlightRecord) => string;
  onCommentDraftChange?: (drafts: SessionCommentDraftSnapshot) => void;
}

export class ReaderPanelCoordinator {
  private view: ReaderSessionView | null = null;
  private presenter: ReaderPanelPresenter | null = null;
  private messages: ReaderSessionMessages = DEFAULT_SESSION_MESSAGES;
  private readonly hintManager = new ReaderHintManager(() => this.messages);
  private currentHintState: ReaderHintState = 'noHighlights';

  constructor(private readonly options: ReaderPanelCoordinatorOptions) {}

  mount(messages: ReaderSessionMessages): void {
    if (this.view) {
      return;
    }
    this.messages = messages;
    this.view = this.options.viewFactory.createView(this.options.callbacks, messages.panel, {
      ...(this.options.onCommentDraftChange
        ? { onCommentDraftChange: this.options.onCommentDraftChange }
        : {})
    });
    this.presenter = new ReaderPanelPresenter(this.view, {
      reconstructText: (highlight) => this.options.reconstructText(highlight)
    });
    this.presenter.render([]);
    this.applyHint('noHighlights', 0);
  }

  updateMessages(messages: ReaderSessionMessages, highlights: ReaderHighlightRecord[]): void {
    this.messages = messages;
    if (this.presenter) {
      this.presenter.updateTexts(messages.panel);
      this.presenter.render(highlights);
      this.refreshHint(highlights.length);
    }
  }

  updateHighlights(highlights: ReaderHighlightRecord[]): void {
    if (!this.presenter) {
      return;
    }
    this.presenter.render(highlights);
    this.applyHint(this.currentHintState, highlights.length);
  }

  updateDestination(destination: ExportDestinationSurfacePreview | undefined): void {
    this.view?.updateDestination?.(destination);
  }

  snapshotCommentDrafts(): SessionCommentDraftSnapshot {
    return this.view?.snapshotCommentDrafts?.() ?? {};
  }

  hydrateCommentDrafts(drafts: SessionCommentDraftSnapshot): void {
    this.view?.hydrateCommentDrafts?.(drafts);
  }

  getElement(): HTMLElement | null {
    return this.view?.element ?? null;
  }

  applyHint(state: ReaderHintState, highlightCount: number): void {
    const result = this.hintManager.apply(state, { highlightCount });
    this.currentHintState = result.state;
    this.view?.updateHint(result.hint);
  }

  refreshHint(highlightCount: number): void {
    const result = this.hintManager.refresh({ highlightCount });
    this.currentHintState = result.state;
    this.view?.updateHint(result.hint);
  }

  stopEditing(): void {
    this.view?.stopEditing();
  }

  isEditing(): boolean {
    return this.view?.isEditing() ?? false;
  }

  destroy(): void {
    this.view?.destroy();
    this.view = null;
    this.presenter = null;
    this.currentHintState = 'noHighlights';
  }
}
