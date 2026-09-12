import { loadExtensionStyle } from './styleRegistry';
import {
  createManagedStyleSheet,
  ManagedShadowStyleHost,
  supportsAdoptedStyleSheets,
  type ManagedStyleEntry,
  type StyleAttachmentHandle
} from '@ui/foundation/style-host';

const CLIPPER_STYLE_KEY = 'clipper-style-pack';

class ClipperStyleSheetManager {
  private static instance: ClipperStyleSheetManager | null = null;
  private readonly styleHost = new ManagedShadowStyleHost();
  private assetGeneration = 0;
  private cssText: string | null = null;
  private sheet: CSSStyleSheet | null = null;
  private pendingLoad: Promise<readonly ManagedStyleEntry[]> | null = null;

  static getInstance(): ClipperStyleSheetManager {
    if (!ClipperStyleSheetManager.instance) {
      ClipperStyleSheetManager.instance = new ClipperStyleSheetManager();
    }
    return ClipperStyleSheetManager.instance;
  }

  async initialize(): Promise<void> {
    await this.getEntries();
  }

  applyClipperStyles(root: ShadowRoot): StyleAttachmentHandle {
    return this.styleHost.attach(root, () => this.getEntries());
  }

  destroy(): void {
    this.styleHost.destroy();
    this.assetGeneration += 1;
    this.cssText = null;
    this.sheet = null;
    this.pendingLoad = null;
  }

  getRegistrationCount(): number {
    return this.styleHost.getRegistrationCount();
  }

  private getEntries(): Promise<readonly ManagedStyleEntry[]> {
    if (this.cssText !== null) return Promise.resolve(this.loadedEntries());
    if (this.pendingLoad) return this.pendingLoad;

    const generation = this.assetGeneration;
    const pending = loadExtensionStyle('ui/stitch-runtime/styles/clipper.css')
      .then((cssText) => {
        if (generation !== this.assetGeneration) {
          throw new Error('Clipper style load was superseded');
        }
        this.cssText = cssText;
        this.sheet = supportsAdoptedStyleSheets() ? createManagedStyleSheet(cssText) : null;
        return this.loadedEntries();
      })
      .finally(() => {
        if (this.pendingLoad === pending) this.pendingLoad = null;
      });
    this.pendingLoad = pending;
    return pending;
  }

  private loadedEntries(): readonly ManagedStyleEntry[] {
    return [{ key: CLIPPER_STYLE_KEY, cssText: this.cssText ?? '', sheet: this.sheet }];
  }
}

export const clipperStyleSheetManager = ClipperStyleSheetManager.getInstance();
export { supportsAdoptedStyleSheets };
