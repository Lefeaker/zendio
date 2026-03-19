import { loadClipperStyle } from './styleRegistry';
import {
  applyManagedShadowStyle,
  createManagedStyleSheet,
  supportsAdoptedStyleSheets
} from '../../shared/shadowStyleBridge';

const CLIPPER_BRIDGE_KEY = 'clipper-tailwind';

class ClipperStyleSheetManager {
  private static instance: ClipperStyleSheetManager | null = null;
  private initialized = false;
  private clipperSheet: CSSStyleSheet | null = null;
  private clipperStyles: string | null = null;
  private pendingLoad: Promise<void> | null = null;

  static getInstance(): ClipperStyleSheetManager {
    if (!ClipperStyleSheetManager.instance) {
      ClipperStyleSheetManager.instance = new ClipperStyleSheetManager();
    }
    return ClipperStyleSheetManager.instance;
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.pendingLoad !== null) {
      await this.pendingLoad;
      return;
    }

    const canUseAdoptedStyleSheets = supportsAdoptedStyleSheets();

    // 延迟加载样式，避免模块顶层导入失败
    this.pendingLoad = loadClipperStyle('clipper.tailwind')
      .then((styles) => {
        this.clipperStyles = styles;
        if (!canUseAdoptedStyleSheets) {
          this.clipperSheet = null;
          return;
        }
        this.clipperSheet = createManagedStyleSheet(styles);
      })
      .catch((error) => {
        console.warn('[ClipperStyleSheetManager] Failed to load styles:', error);
        this.clipperSheet = null;
        this.clipperStyles = null;
      })
      .finally(() => {
        this.pendingLoad = null;
        this.initialized = true;
      });

    await this.pendingLoad;
  }

  getSheets(): CSSStyleSheet[] {
    if (!this.initialized) {
      throw new Error('[ClipperStyleSheetManager] initialize() must be called first');
    }
    return this.clipperSheet ? [this.clipperSheet] : [];
  }

  applyTo(shadowRoot: ShadowRoot): void {
    applyManagedShadowStyle(shadowRoot, CLIPPER_BRIDGE_KEY, this.clipperStyles ?? '', this.clipperSheet);
  }

  destroy(): void {
    this.clipperSheet = null;
    this.clipperStyles = null;
    this.pendingLoad = null;
    this.initialized = false;
  }
}

export const clipperStyleSheetManager = ClipperStyleSheetManager.getInstance();
export { supportsAdoptedStyleSheets };
