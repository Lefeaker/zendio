import { loadClipperStyle, loadExtensionStyle } from '../../clipper/shared/styleRegistry';
import {
  applyManagedShadowStyle,
  createManagedStyleSheet,
  supportsAdoptedStyleSheets
} from '@ui/foundation/style-host';

const PANEL_CLIPPER_BRIDGE_KEY = 'panel-clipper-tailwind';
const PANEL_VIDEO_BRIDGE_KEY = 'panel-video-tailwind';
const PANEL_STITCH_RUNTIME_KEY = 'panel-stitch-runtime';
const PANEL_STITCH_SECONDARY_RUNTIME_KEY = 'panel-stitch-secondary-runtime';

class PanelStyleSheetManager {
  private static instance: PanelStyleSheetManager | null = null;
  private initialized = false;
  private pendingLoad: Promise<void> | null = null;
  private videoPendingLoad: Promise<void> | null = null;
  private stitchPendingLoad: Promise<void> | null = null;
  private clipperSheet: CSSStyleSheet | null = null;
  private videoSheet: CSSStyleSheet | null = null;
  private stitchSheet: CSSStyleSheet | null = null;
  private stitchSecondarySheet: CSSStyleSheet | null = null;
  private clipperStyles: string | null = null;
  private videoStyles: string | null = null;
  private stitchStyles: string | null = null;
  private stitchSecondaryStyles: string | null = null;
  private readonly readerRoots = new Set<ShadowRoot>();
  private readonly videoRoots = new Set<ShadowRoot>();
  private readonly stitchRuntimeRoots = new Set<ShadowRoot>();

  static getInstance(): PanelStyleSheetManager {
    if (!PanelStyleSheetManager.instance) {
      PanelStyleSheetManager.instance = new PanelStyleSheetManager();
    }
    return PanelStyleSheetManager.instance;
  }

  initialize(): Promise<void> {
    if (this.initialized) {
      return this.pendingLoad ?? Promise.resolve();
    }

    if (this.pendingLoad !== null) {
      return this.pendingLoad;
    }

    this.pendingLoad = loadClipperStyle('clipper.tailwind')
      .then((clipperCss) => {
        this.clipperStyles = clipperCss;

        if (supportsAdoptedStyleSheets()) {
          this.clipperSheet = createManagedStyleSheet(clipperCss);
        } else {
          this.clipperSheet = null;
        }
        this.replayRegisteredRoots();
      })
      .catch((error) => {
        console.warn('[PanelStyleSheetManager] Failed to load styles:', error);
        this.clipperSheet = null;
        this.clipperStyles = null;
      })
      .finally(() => {
        this.initialized = true;
        this.pendingLoad = null;
      });

    return this.pendingLoad;
  }

  whenVideoStylesReady(): Promise<void> {
    return this.videoPendingLoad ?? Promise.resolve();
  }

  applyReaderStyles(shadowRoot: ShadowRoot): void {
    if (!this.initialized) {
      void this.initialize();
    }
    this.readerRoots.add(shadowRoot);
    this.applyStitchStyles(shadowRoot);
    applyManagedShadowStyle(
      shadowRoot,
      PANEL_CLIPPER_BRIDGE_KEY,
      this.clipperStyles ?? '',
      this.clipperSheet
    );
  }

  applyVideoStyles(shadowRoot: ShadowRoot): void {
    if (!this.initialized) {
      void this.initialize();
    }
    void this.loadVideoStyles();
    this.videoRoots.add(shadowRoot);

    this.applyStitchStyles(shadowRoot);
    applyManagedShadowStyle(
      shadowRoot,
      PANEL_CLIPPER_BRIDGE_KEY,
      this.clipperStyles ?? '',
      this.clipperSheet
    );
    applyManagedShadowStyle(
      shadowRoot,
      PANEL_VIDEO_BRIDGE_KEY,
      this.videoStyles ?? '',
      this.videoSheet
    );
  }

  applyStitchRuntimeStyles(shadowRoot: ShadowRoot): void {
    if (!this.initialized) {
      void this.initialize();
    }
    void this.loadStitchStyles();
    this.stitchRuntimeRoots.add(shadowRoot);
    this.applyStitchStyles(shadowRoot);
  }

  destroy(): void {
    this.pendingLoad = null;
    this.videoPendingLoad = null;
    this.stitchPendingLoad = null;
    this.clipperSheet = null;
    this.videoSheet = null;
    this.stitchSheet = null;
    this.stitchSecondarySheet = null;
    this.clipperStyles = null;
    this.videoStyles = null;
    this.stitchStyles = null;
    this.stitchSecondaryStyles = null;
    this.readerRoots.clear();
    this.videoRoots.clear();
    this.stitchRuntimeRoots.clear();
    this.initialized = false;
  }

  private loadVideoStyles(): Promise<void> {
    if (this.videoStyles !== null) {
      return this.videoPendingLoad ?? Promise.resolve();
    }
    if (this.videoPendingLoad !== null) {
      return this.videoPendingLoad;
    }

    this.videoPendingLoad = loadClipperStyle('video.tailwind')
      .then((videoCss) => {
        this.videoStyles = videoCss;
        this.videoSheet = supportsAdoptedStyleSheets() ? createManagedStyleSheet(videoCss) : null;
        this.replayRegisteredRoots();
      })
      .catch((error) => {
        console.warn('[PanelStyleSheetManager] Failed to load video styles:', error);
        this.videoSheet = null;
        this.videoStyles = null;
      })
      .finally(() => {
        this.videoPendingLoad = null;
      });

    return this.videoPendingLoad;
  }

  private loadStitchStyles(): Promise<void> {
    if (this.stitchStyles !== null && this.stitchSecondaryStyles !== null) {
      return this.stitchPendingLoad ?? Promise.resolve();
    }
    if (this.stitchPendingLoad !== null) {
      return this.stitchPendingLoad;
    }

    this.stitchPendingLoad = Promise.all([
      loadExtensionStyle('options/stitch/styles/stitch.css'),
      loadExtensionStyle('options/stitch/styles/variants/stitch-secondary.css')
    ])
      .then(([stitchCss, stitchSecondaryCss]) => {
        this.stitchStyles = stitchCss;
        this.stitchSecondaryStyles = stitchSecondaryCss;
        if (supportsAdoptedStyleSheets()) {
          this.stitchSheet = createManagedStyleSheet(stitchCss);
          this.stitchSecondarySheet = createManagedStyleSheet(stitchSecondaryCss);
        } else {
          this.stitchSheet = null;
          this.stitchSecondarySheet = null;
        }
        this.replayRegisteredRoots();
      })
      .catch((error) => {
        console.warn('[PanelStyleSheetManager] Failed to load stitch styles:', error);
        this.stitchSheet = null;
        this.stitchSecondarySheet = null;
        this.stitchStyles = null;
        this.stitchSecondaryStyles = null;
      })
      .finally(() => {
        this.stitchPendingLoad = null;
      });

    return this.stitchPendingLoad;
  }

  private replayRegisteredRoots(): void {
    this.stitchRuntimeRoots.forEach((root) => {
      if (!this.isRootConnected(root)) {
        this.stitchRuntimeRoots.delete(root);
        return;
      }
      this.applyStitchStyles(root);
    });

    this.readerRoots.forEach((root) => {
      if (!this.isRootConnected(root)) {
        this.readerRoots.delete(root);
        return;
      }
      this.applyStitchStyles(root);
      applyManagedShadowStyle(
        root,
        PANEL_CLIPPER_BRIDGE_KEY,
        this.clipperStyles ?? '',
        this.clipperSheet
      );
    });

    this.videoRoots.forEach((root) => {
      if (!this.isRootConnected(root)) {
        this.videoRoots.delete(root);
        return;
      }
      this.applyStitchStyles(root);
      applyManagedShadowStyle(
        root,
        PANEL_CLIPPER_BRIDGE_KEY,
        this.clipperStyles ?? '',
        this.clipperSheet
      );
      applyManagedShadowStyle(
        root,
        PANEL_VIDEO_BRIDGE_KEY,
        this.videoStyles ?? '',
        this.videoSheet
      );
    });
  }

  private isRootConnected(root: ShadowRoot): boolean {
    return Boolean(root.host?.isConnected);
  }

  private applyStitchStyles(root: ShadowRoot): void {
    applyManagedShadowStyle(
      root,
      PANEL_STITCH_RUNTIME_KEY,
      this.stitchStyles ?? '',
      this.stitchSheet
    );
    applyManagedShadowStyle(
      root,
      PANEL_STITCH_SECONDARY_RUNTIME_KEY,
      this.stitchSecondaryStyles ?? '',
      this.stitchSecondarySheet
    );
  }
}

export const panelStyleSheetManager = PanelStyleSheetManager.getInstance();
