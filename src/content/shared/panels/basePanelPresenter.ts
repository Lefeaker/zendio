export abstract class BasePanelPresenter<TView> {
  protected constructor(protected readonly view: TView) {}

  protected normalizeText(text: string): string {
    return text.replace(/\s+/g, ' ').trim();
  }

  protected buildCommentPreview(comment: string, limit = 120): string {
    const normalized = this.normalizeText(comment);
    if (!normalized) {
      return '';
    }
    if (normalized.length <= limit) {
      return normalized;
    }
    return `${normalized.slice(0, limit - 3)}...`;
  }

  protected buildExcerpt(text: string, limit = 80): string {
    const normalized = this.normalizeText(text);
    if (!normalized) {
      return '[empty]';
    }
    if (normalized.length <= limit) {
      return normalized;
    }
    return `${normalized.slice(0, limit - 3)}...`;
  }
}
