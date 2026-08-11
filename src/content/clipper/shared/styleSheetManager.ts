import { loadExtensionStyle } from './styleRegistry';
import {
  createManagedStyleSheet,
  ManagedShadowStyleHost,
  supportsAdoptedStyleSheets,
  type ManagedStyleEntry,
  type StyleAttachmentHandle
} from '@ui/foundation/style-host';

const STITCH_RUNTIME_KEY = 'clipper-stitch-runtime';
const STITCH_SECONDARY_RUNTIME_KEY = 'clipper-stitch-secondary-runtime';

class ClipperStyleSheetManager {
  private static instance: ClipperStyleSheetManager | null = null;
  private readonly styleHost = new ManagedShadowStyleHost();
  private initialized = false;
  private assetGeneration = 0;
  private stitchSheet: CSSStyleSheet | null = null;
  private stitchSecondarySheet: CSSStyleSheet | null = null;
  private stitchStyles: string | null = null;
  private stitchSecondaryStyles: string | null = null;
  private pendingLoad: Promise<boolean> | null = null;

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
    const generation = this.assetGeneration;
    await this.loadStitchStyles();
    if (generation === this.assetGeneration) {
      this.initialized = true;
    }
  }

  getSheets(): CSSStyleSheet[] {
    if (!this.initialized) {
      throw new Error('[ClipperStyleSheetManager] initialize() must be called first');
    }
    return [this.stitchSheet, this.stitchSecondarySheet].filter((sheet): sheet is CSSStyleSheet =>
      Boolean(sheet)
    );
  }

  applyTo(root: ShadowRoot): StyleAttachmentHandle {
    return this.applyStitchRuntimeStyles(root);
  }

  applyStitchRuntimeStyles(root: ShadowRoot): StyleAttachmentHandle {
    if (!this.initialized) {
      void this.initialize();
    }
    const loaded = this.stitchStyles !== null && this.stitchSecondaryStyles !== null;
    return this.styleHost.attach(
      root,
      loaded ? this.getLoadedEntries() : () => this.getStitchEntries()
    );
  }

  destroy(): void {
    this.styleHost.destroy();
    this.assetGeneration += 1;
    this.stitchSheet = null;
    this.stitchSecondarySheet = null;
    this.stitchStyles = null;
    this.stitchSecondaryStyles = null;
    this.pendingLoad = null;
    this.initialized = false;
  }

  getRegistrationCount(): number {
    return this.styleHost.getRegistrationCount();
  }

  private async getStitchEntries(): Promise<readonly ManagedStyleEntry[]> {
    if (!(await this.loadStitchStyles())) {
      throw new Error('Clipper style assets are unavailable');
    }
    return this.getLoadedEntries();
  }

  private getLoadedEntries(): readonly ManagedStyleEntry[] {
    return [
      {
        key: STITCH_RUNTIME_KEY,
        cssText: this.stitchStyles ?? '',
        sheet: this.stitchSheet
      },
      {
        key: STITCH_SECONDARY_RUNTIME_KEY,
        cssText: this.stitchSecondaryStyles ?? '',
        sheet: this.stitchSecondarySheet
      }
    ];
  }

  private loadStitchStyles(): Promise<boolean> {
    if (this.stitchStyles !== null && this.stitchSecondaryStyles !== null) {
      return Promise.resolve(true);
    }
    if (this.pendingLoad) {
      return this.pendingLoad;
    }

    const generation = this.assetGeneration;
    const pending = Promise.all([
      loadExtensionStyle('options/stitch/styles/stitch.css'),
      loadExtensionStyle('options/stitch/styles/variants/stitch-secondary.css')
    ])
      .then(([stitchStyles, stitchSecondaryStyles]) => {
        if (generation !== this.assetGeneration) {
          return false;
        }
        this.stitchStyles = stitchStyles;
        this.stitchSecondaryStyles = stitchSecondaryStyles;
        if (supportsAdoptedStyleSheets()) {
          this.stitchSheet = createManagedStyleSheet(stitchStyles);
          this.stitchSecondarySheet = createManagedStyleSheet(stitchSecondaryStyles);
        } else {
          this.stitchSheet = null;
          this.stitchSecondarySheet = null;
        }
        return true;
      })
      .catch((error) => {
        if (generation === this.assetGeneration) {
          console.warn('[ClipperStyleSheetManager] Failed to load styles:', error);
          this.stitchSheet = null;
          this.stitchSecondarySheet = null;
          this.stitchStyles = null;
          this.stitchSecondaryStyles = null;
        }
        return false;
      })
      .finally(() => {
        if (this.pendingLoad === pending) {
          this.pendingLoad = null;
        }
      });
    this.pendingLoad = pending;
    return pending;
  }
}

export const clipperStyleSheetManager = ClipperStyleSheetManager.getInstance();
export { supportsAdoptedStyleSheets };
