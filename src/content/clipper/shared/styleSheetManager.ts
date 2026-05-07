import { loadClipperStyle, loadExtensionStyle } from './styleRegistry';
import {
  applyManagedShadowStyle,
  createManagedStyleSheet,
  supportsAdoptedStyleSheets
} from '@ui/foundation/style-host';

const CLIPPER_BRIDGE_KEY = 'clipper-tailwind';
const STITCH_RUNTIME_KEY = 'clipper-stitch-runtime';
const STITCH_SECONDARY_RUNTIME_KEY = 'clipper-stitch-secondary-runtime';

class ClipperStyleSheetManager {
  private static instance: ClipperStyleSheetManager | null = null;
  private initialized = false;
  private clipperSheet: CSSStyleSheet | null = null;
  private stitchSheet: CSSStyleSheet | null = null;
  private stitchSecondarySheet: CSSStyleSheet | null = null;
  private clipperStyles: string | null = null;
  private stitchStyles: string | null = null;
  private stitchSecondaryStyles: string | null = null;
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
    this.pendingLoad = Promise.all([
      loadClipperStyle('clipper.tailwind'),
      loadExtensionStyle('options/stitch/styles/stitch.css'),
      loadExtensionStyle('options/stitch/styles/variants/stitch-secondary.css')
    ])
      .then(([styles, stitchStyles, stitchSecondaryStyles]) => {
        this.clipperStyles = styles;
        this.stitchStyles = stitchStyles;
        this.stitchSecondaryStyles = stitchSecondaryStyles;
        if (!canUseAdoptedStyleSheets) {
          this.clipperSheet = null;
          this.stitchSheet = null;
          this.stitchSecondarySheet = null;
          return;
        }
        this.clipperSheet = createManagedStyleSheet(styles);
        this.stitchSheet = createManagedStyleSheet(stitchStyles);
        this.stitchSecondarySheet = createManagedStyleSheet(stitchSecondaryStyles);
      })
      .catch((error) => {
        console.warn('[ClipperStyleSheetManager] Failed to load styles:', error);
        this.clipperSheet = null;
        this.stitchSheet = null;
        this.stitchSecondarySheet = null;
        this.clipperStyles = null;
        this.stitchStyles = null;
        this.stitchSecondaryStyles = null;
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
    return [this.stitchSheet, this.stitchSecondarySheet, this.clipperSheet].filter(
      (sheet): sheet is CSSStyleSheet => Boolean(sheet)
    );
  }

  applyTo(shadowRoot: ShadowRoot): void {
    this.applyStitchRuntimeStyles(shadowRoot);
    applyManagedShadowStyle(
      shadowRoot,
      CLIPPER_BRIDGE_KEY,
      this.clipperStyles ?? '',
      this.clipperSheet
    );
  }

  applyStitchRuntimeStyles(shadowRoot: ShadowRoot): void {
    applyManagedShadowStyle(
      shadowRoot,
      STITCH_RUNTIME_KEY,
      this.stitchStyles ?? '',
      this.stitchSheet
    );
    applyManagedShadowStyle(
      shadowRoot,
      STITCH_SECONDARY_RUNTIME_KEY,
      this.stitchSecondaryStyles ?? '',
      this.stitchSecondarySheet
    );
  }

  destroy(): void {
    this.clipperSheet = null;
    this.stitchSheet = null;
    this.stitchSecondarySheet = null;
    this.clipperStyles = null;
    this.stitchStyles = null;
    this.stitchSecondaryStyles = null;
    this.pendingLoad = null;
    this.initialized = false;
  }
}

export const clipperStyleSheetManager = ClipperStyleSheetManager.getInstance();
export { supportsAdoptedStyleSheets };
