import { findVideoControlTarget } from './videoPromptObserver';
import { watchVideoNavigation, type VideoNavigationWatcher } from './videoNavigationWatcher';

export interface VideoSessionLifecycleHandlers {
  onUrlChange(): void;
  onVideoElementChange(element: HTMLVideoElement | null): void;
}

export interface VideoSessionLifecycleDependencies {
  doc: Document;
  locateVideoElement(): HTMLVideoElement | null;
  watchNavigation?: (doc: Document, onChange: () => void) => VideoNavigationWatcher;
}

const VIDEO_ELEMENT_EVENTS = [
  'loadedmetadata',
  'durationchange',
  'emptied',
  'play',
  'pause'
] as const;

export class VideoSessionLifecycle {
  private navigationWatcher: VideoNavigationWatcher | null = null;
  private currentVideo: HTMLVideoElement | null = null;
  private playerObserver: MutationObserver | null = null;

  constructor(
    private readonly deps: VideoSessionLifecycleDependencies,
    private readonly handlers: VideoSessionLifecycleHandlers
  ) {}

  start(): void {
    const handleNavigation = (): void => this.handlers.onUrlChange();
    this.navigationWatcher =
      this.deps.watchNavigation?.(this.deps.doc, handleNavigation) ??
      watchVideoNavigation(this.deps.doc, handleNavigation);
    const video = this.deps.locateVideoElement();
    this.attachVideoElement(video);
    this.handlers.onVideoElementChange(video);
    if (!video) {
      this.startPlayerObserver();
    }
  }

  stop(): void {
    this.navigationWatcher?.stop();
    this.navigationWatcher = null;
    this.detachVideoElement();
    this.playerObserver?.disconnect();
    this.playerObserver = null;
  }

  private attachVideoElement(video: HTMLVideoElement | null): void {
    if (this.currentVideo === video) {
      return;
    }
    this.detachVideoElement();
    this.currentVideo = video;
    for (const eventName of VIDEO_ELEMENT_EVENTS) {
      video?.addEventListener(eventName, this.handleVideoEvent, true);
    }
  }

  private detachVideoElement(): void {
    if (!this.currentVideo) {
      return;
    }
    for (const eventName of VIDEO_ELEMENT_EVENTS) {
      this.currentVideo.removeEventListener(eventName, this.handleVideoEvent, true);
    }
    this.currentVideo = null;
  }

  private handleVideoEvent = (): void => {
    const video = this.deps.locateVideoElement();
    this.attachVideoElement(video);
    this.handlers.onVideoElementChange(video);
  };

  private startPlayerObserver(): void {
    if (this.playerObserver || typeof MutationObserver === 'undefined') {
      return;
    }

    const controlTarget = findVideoControlTarget(this.deps.doc, this.deps.doc.location.href);
    const observeTarget = controlTarget?.parentElement ?? null;
    if (!observeTarget) {
      return;
    }

    this.playerObserver = new MutationObserver(() => {
      const video = this.deps.locateVideoElement();
      if (!video) {
        return;
      }
      this.playerObserver?.disconnect();
      this.playerObserver = null;
      this.attachVideoElement(video);
      this.handlers.onVideoElementChange(video);
    });

    try {
      this.playerObserver.observe(observeTarget, { childList: true, subtree: true });
    } catch {
      this.playerObserver = null;
    }
  }
}
