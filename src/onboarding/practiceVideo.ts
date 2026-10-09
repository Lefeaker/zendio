import type { PlatformServices } from '../platform';
import type { IOptionsRepository } from '../shared/repositories/IOptionsRepository';
import type { Messages } from '../i18n/messages';
import { element, learningButton } from './learningView';

export function createPracticeVideo(m: Messages) {
  const container = element('section', 'practice-video');
  const video = element('video', 'practice-player');
  video.id = 'practiceVideo';
  video.controls = true;
  video.muted = true;
  video.preload = 'auto';
  video.src = '../onboarding/practice.webm';
  video.addEventListener(
    'loadedmetadata',
    () => {
      const requested = Number(new URL(location.href).searchParams.get('t') ?? '3');
      video.currentTime = Number.isFinite(requested)
        ? Math.max(0, Math.min(video.duration, requested))
        : 3;
    },
    { once: true }
  );
  const cues = element('div', 'practice-video-cues');
  cues.setAttribute('aria-label', m.practiceVideoFrames);
  for (const time of [3, 12]) {
    const button = learningButton(time === 3 ? '00:03' : '00:12', () => {
      video.pause();
      video.currentTime = time;
    });
    button.dataset.practiceTime = String(time);
    cues.append(button);
  }
  container.append(video, element('p', 'practice-video-caption', m.practiceVideoFrames), cues);
  return { container, video };
}

/** Explicit lesson action starts the same session owner as the normal video entrypoint. */
export async function startPracticeVideo(
  platform: PlatformServices,
  optionsRepository: IOptionsRepository
): Promise<void> {
  const { createVideoSessionAdapter } = await import('../content/video/videoLazyRuntime');
  const session = createVideoSessionAdapter(document, {
    optionsRepository,
    storage: platform.storage,
    messaging: platform.messaging,
    runtime: platform.runtime
  });
  await session.start();
}
