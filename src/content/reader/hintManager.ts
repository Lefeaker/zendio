import type { ReaderHintState, ReaderSessionMessages } from './sessionMessages';
import { BaseHintManager } from '../shared/hints/baseHintManager';

export interface ReaderHintContext {
  highlightCount: number;
}

export class ReaderHintManager extends BaseHintManager<ReaderHintState, ReaderHintContext> {
  constructor(private readonly getMessages: () => ReaderSessionMessages) {
    super('noHighlights');
  }

  protected resolveState(state: ReaderHintState, context: ReaderHintContext): ReaderHintState {
    if (state === 'exporting' || state === 'failure' || state === 'selectionFailure') {
      return state;
    }
    if (context.highlightCount === 0) {
      return 'noHighlights';
    }
    if (state === 'noHighlights' && context.highlightCount > 0) {
      return 'panel';
    }
    return state;
  }

  protected getHint(state: ReaderHintState): string {
    const messages = this.getMessages();
    switch (state) {
      case 'panel':
        return messages.panel.hint;
      case 'noHighlights':
        return messages.hintNoHighlights;
      case 'exporting':
        return messages.hintExporting;
      case 'failure':
        return messages.hintFailure;
      case 'selectionFailure':
        return messages.hintSelectionFailure;
      default:
        return messages.panel.hint;
    }
  }
}
