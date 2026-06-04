import type { VideoOptions } from '../../shared/types/options';

type VideoCommentEditorPlaybackConfig = Pick<VideoOptions, 'commentEditorAutoPause'>;

export class VideoCommentEditorPlaybackPolicy {
  private autoPauseAllEditors = false;
  private readonly addNoteTransactionIds = new Set<string>();
  private readonly leasedEditorIds = new Set<string>();

  applyConfig(config: VideoCommentEditorPlaybackConfig | null | undefined): void {
    this.autoPauseAllEditors = config?.commentEditorAutoPause === true;
  }

  markAddNoteTransaction(captureId: string): void {
    this.addNoteTransactionIds.add(captureId);
    this.leasedEditorIds.add(captureId);
  }

  shouldAcquireLeaseOnFocus(captureId: string): boolean {
    if (!this.autoPauseAllEditors && !this.addNoteTransactionIds.has(captureId)) {
      return false;
    }
    this.leasedEditorIds.add(captureId);
    return true;
  }

  shouldReleaseLeaseOnBlur(captureId: string): boolean {
    return this.leasedEditorIds.has(captureId);
  }

  clearCapture(captureId: string): void {
    this.addNoteTransactionIds.delete(captureId);
    this.leasedEditorIds.delete(captureId);
  }

  reset(): void {
    this.addNoteTransactionIds.clear();
    this.leasedEditorIds.clear();
  }
}
