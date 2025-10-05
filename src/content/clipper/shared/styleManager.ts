export class InlineStyleManager {
  private styleElement: HTMLStyleElement | null = null;

  constructor(private ownerDocument: Document) {}

  mount(cssText: string): void {
    this.unmount();
    const style = this.ownerDocument.createElement('style');
    style.textContent = cssText;
    this.ownerDocument.head.appendChild(style);
    this.styleElement = style;
  }

  unmount(): void {
    if (this.styleElement) {
      this.styleElement.remove();
      this.styleElement = null;
    }
  }
}
