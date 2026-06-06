import {
  deserializeStoredCaptures,
  loadStoredCaptureData,
  saveCaptureData,
  serializeCaptures,
  type StoredVideoCaptureData,
  type StorageNamespace
} from './captureStorage';
import {
  createVideoPlatformAdapter,
  type TimestampBuildContext,
  type VideoPlatformAdapter,
  type VideoPlatformContext
} from './platforms';
import { detectVideoIdentity, type VideoPlatform } from './utils';
import type { VideoFragmentCapture } from './types';
import type { VideoHintState } from './videoHintManager';
import type { VideoSessionState } from './sessionState';

export interface VideoSessionPlatformControllerDependencies {
  doc: Document;
  storage: StorageNamespace;
  state: VideoSessionState;
  createPlatformContext(): VideoPlatformContext;
  onAdapterChange(adapter: VideoPlatformAdapter | null): void;
  ensureCaptureHighlight(capture: VideoFragmentCapture): void;
  restoreDraftState?(): Promise<boolean>;
  onLegacyRestore?(storageKey: string): void;
  detectVideoIdentity?: typeof detectVideoIdentity;
  createVideoPlatformAdapter?: typeof createVideoPlatformAdapter;
  loadStoredCaptureData?: typeof loadStoredCaptureData;
  saveCaptureData?: typeof saveCaptureData;
  deserializeStoredCaptures?: typeof deserializeStoredCaptures;
  serializeCaptures?: typeof serializeCaptures;
}

export interface RefreshContextResult {
  hintState: VideoHintState;
  shouldScheduleFragmentRestore: boolean;
  restoreSource: 'draft' | 'legacy' | 'none';
}

export class VideoSessionPlatformController {
  private readonly detectIdentity: typeof detectVideoIdentity;
  private readonly createAdapter: typeof createVideoPlatformAdapter;
  private readonly loadCaptureData: typeof loadStoredCaptureData;
  private readonly saveCapturePayload: typeof saveCaptureData;
  private readonly deserializeCaptures: typeof deserializeStoredCaptures;
  private readonly serializeCapturesList: typeof serializeCaptures;

  constructor(private readonly deps: VideoSessionPlatformControllerDependencies) {
    this.detectIdentity = deps.detectVideoIdentity ?? detectVideoIdentity;
    this.createAdapter = deps.createVideoPlatformAdapter ?? createVideoPlatformAdapter;
    this.loadCaptureData = deps.loadStoredCaptureData ?? loadStoredCaptureData;
    this.saveCapturePayload = deps.saveCaptureData ?? saveCaptureData;
    this.deserializeCaptures = deps.deserializeStoredCaptures ?? deserializeStoredCaptures;
    this.serializeCapturesList = deps.serializeCaptures ?? serializeCaptures;
  }

  get platform(): VideoPlatform {
    return this.deps.state.platform;
  }

  get adapter(): VideoPlatformAdapter | null {
    return this.deps.state.platformAdapter;
  }

  updateVideoContext(): void {
    const rawUrl = this.deps.doc.location.href;
    const identity = this.detectIdentity(rawUrl);
    this.deps.state.videoUrl = rawUrl;
    this.deps.state.platform = identity.platform;
    this.deps.state.videoId = identity.videoId;
    this.deps.state.canonicalUrl = identity.canonicalUrl || rawUrl;
    this.deps.state.storageKey = identity.storageKey;
  }

  syncPlatformAdapter(): void {
    if (
      this.deps.state.platformAdapter &&
      this.deps.state.platformAdapter.platform === this.deps.state.platform
    ) {
      this.deps.state.platformAdapter.observeSelectionRoots?.();
      return;
    }

    this.deps.state.platformAdapter?.dispose();
    this.deps.state.platformAdapter = this.createAdapter(
      this.deps.state.platform,
      this.deps.createPlatformContext()
    );
    this.deps.onAdapterChange(this.deps.state.platformAdapter);
    this.deps.state.platformAdapter.observeSelectionRoots?.();
  }

  extractVideoTitle(): string {
    const titleSelectors = [
      'ytd-watch-metadata #title h1',
      'h1.title',
      '#viewbox h1',
      '#video-title',
      'h1'
    ];

    for (const selector of titleSelectors) {
      const node = this.deps.doc.querySelector(selector);
      if (node?.textContent) {
        const text = node.textContent.trim();
        if (text) {
          return text;
        }
      }
    }

    const ogTitle = this.deps.doc
      .querySelector<HTMLMetaElement>('meta[property="og:title"]')
      ?.getAttribute('content');
    if (ogTitle && ogTitle.trim()) {
      return ogTitle.trim();
    }

    const rawTitle = this.deps.doc.title || '';
    const platformTitle = this.deps.state.platformAdapter?.formatVideoTitle(rawTitle);
    if (platformTitle && platformTitle.trim()) {
      return platformTitle.trim();
    }

    return rawTitle.trim();
  }

  async refreshContext(): Promise<RefreshContextResult> {
    const previousKey = this.deps.state.storageKey;
    this.updateVideoContext();
    this.syncPlatformAdapter();
    const currentKey = this.deps.state.storageKey;

    if (!currentKey) {
      this.deps.state.captures = [];
      this.deps.state.videoTitle = this.extractVideoTitle();
      return { hintState: 'noVideo', shouldScheduleFragmentRestore: false, restoreSource: 'none' };
    }

    if (currentKey === previousKey) {
      return {
        hintState: this.deps.state.captures.length ? 'ready' : 'noCaptures',
        shouldScheduleFragmentRestore: false,
        restoreSource: 'none'
      };
    }

    try {
      let restoreSource: RefreshContextResult['restoreSource'] = 'none';
      this.deps.state.videoTitle = '';

      const restoredDraft = (await this.deps.restoreDraftState?.()) ?? false;
      if (restoredDraft) {
        restoreSource = 'draft';
      } else {
        const raw = await this.loadCaptureData(this.deps.storage, currentKey);
        if (raw?.entries?.length) {
          const fallbackUrl =
            raw.url ||
            this.deps.state.canonicalUrl ||
            this.deps.state.videoUrl ||
            this.deps.doc.location.href;
          this.deps.state.captures = this.deserializeCaptures(raw.entries, { fallbackUrl });
          this.deps.state.videoTitle = raw.title ? raw.title : '';
          if (raw.url) {
            this.deps.state.canonicalUrl = raw.url;
          }
          this.deps.onLegacyRestore?.(currentKey);
          restoreSource = 'legacy';
        } else {
          this.deps.state.captures = [];
        }
      }

      if (!this.deps.state.videoTitle) {
        this.deps.state.videoTitle = this.extractVideoTitle();
      }

      for (const capture of this.deps.state.captures) {
        if (capture.kind === 'fragment') {
          const newWrapperId = this.deps.state.platformAdapter?.restoreHighlight(capture);
          if (newWrapperId !== undefined) {
            capture.wrapperId = newWrapperId;
          }
          this.deps.ensureCaptureHighlight(capture);
        }
      }

      return {
        hintState: this.deps.state.captures.length ? 'ready' : 'noCaptures',
        shouldScheduleFragmentRestore: this.deps.state.captures.some(
          (capture) => capture.kind === 'fragment'
        ),
        restoreSource
      };
    } catch (error) {
      console.warn('[VideoSession] Failed to load stored captures:', error);
      this.deps.state.captures = [];
      return { hintState: 'failure', shouldScheduleFragmentRestore: false, restoreSource: 'none' };
    }
  }

  buildTimestampUrl(timeSec: number): string | null {
    const ctx: TimestampBuildContext = {
      canonicalUrl: this.deps.state.canonicalUrl || '',
      currentUrl: this.deps.doc.location.href,
      videoId: this.deps.state.videoId
    };

    const platformUrl = this.deps.state.platformAdapter?.buildTimestampUrl(timeSec, ctx);
    if (platformUrl) {
      return platformUrl;
    }

    return VideoSessionPlatformController.buildFallbackTimestampUrl(timeSec, ctx);
  }

  static buildFallbackTimestampUrl(timeSec: number, ctx: TimestampBuildContext): string | null {
    try {
      const base = new URL(ctx.canonicalUrl || ctx.currentUrl);
      base.searchParams.set('t', String(timeSec));
      return base.toString();
    } catch {
      return null;
    }
  }

  async saveCaptures(): Promise<VideoHintState | null> {
    if (!this.deps.state.storageKey) {
      return null;
    }

    this.deps.state.saving = true;
    try {
      const payload: StoredVideoCaptureData = {
        title: this.deps.state.videoTitle,
        url: this.deps.state.canonicalUrl || this.deps.state.videoUrl,
        entries: this.serializeCapturesList(this.deps.state.captures),
        updatedAt: Date.now()
      };
      await this.saveCapturePayload(this.deps.storage, this.deps.state.storageKey, payload);
      return this.deps.state.captures.length ? 'ready' : 'noCaptures';
    } catch (error) {
      console.error('[VideoSession] Failed to save captures:', error);
      return 'failure';
    } finally {
      this.deps.state.saving = false;
    }
  }

  dispose(): void {
    this.deps.state.platformAdapter?.dispose();
    this.deps.state.platformAdapter = null;
    this.deps.onAdapterChange(null);
  }
}
