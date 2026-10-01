import type { Messages } from '../i18n/messages';
import type { PracticeGuidance } from './practiceLessonTypes';

function markerTime(marker: HTMLElement): number {
  return (marker.textContent ?? '')
    .trim()
    .split(':')
    .reduce((total, value) => total * 60 + Number(value), 0);
}

/** Observe the real player and screenshot toggle; never seek or toggle on the learner's behalf. */
export function createPracticeVideoLesson(video: HTMLVideoElement, m: Messages) {
  const visited = new Set<string>();
  let pendingSeek: { id: string; time: number; from: number } | undefined;
  let pendingToggle: { id: string; state: string } | undefined;
  let screenshotId = '';
  let removed = false,
    restored = false;
  return {
    onClick(target: Element) {
      const marker = target.closest<HTMLElement>('.session-item-marker-time');
      const item = marker?.closest<HTMLElement>('[data-capture-id]');
      if (marker && item?.dataset.captureId)
        pendingSeek = {
          id: item.dataset.captureId,
          time: markerTime(marker),
          from: video.currentTime
        };
      const toggle = target.closest<HTMLElement>('[data-action-id="video:toggle-screenshot"]');
      if (toggle?.dataset.captureId)
        pendingToggle = {
          id: toggle.dataset.captureId,
          state: toggle.dataset.screenshotState === 'off' ? 'on' : 'off'
        };
    },
    read(root: ShadowRoot): PracticeGuidance {
      const markers = Array.from(
        root.querySelectorAll<HTMLElement>('.video-timestamp-marker .session-item-marker-time')
      );
      const ids = markers.map(
        (marker) => marker.closest<HTMLElement>('[data-capture-id]')?.dataset.captureId ?? ''
      );
      if (
        pendingSeek &&
        ids.includes(pendingSeek.id) &&
        !video.seeking &&
        video.readyState >= 2 &&
        Math.abs(video.currentTime - pendingSeek.time) < 0.7 &&
        Math.abs(pendingSeek.from - pendingSeek.time) > 1
      ) {
        visited.add(pendingSeek.id);
        pendingSeek = undefined;
      }
      const toggle = root.querySelector<HTMLElement>('[data-action-id="video:toggle-screenshot"]');
      if (toggle?.dataset.captureId !== screenshotId) {
        screenshotId = toggle?.dataset.captureId ?? '';
        removed = false;
        restored = false;
      }
      if (
        pendingToggle?.id === screenshotId &&
        toggle?.dataset.screenshotState === pendingToggle.state
      ) {
        if (pendingToggle.state === 'off') {
          removed = true;
          restored = false;
        } else if (removed) restored = true;
        pendingToggle = undefined;
      }
      const milestones = [
        'video-started',
        ...Array.from(visited, (id) => 'video-seek-' + id),
        ...(removed ? ['screenshot-off'] : []),
        ...(restored ? ['screenshot-on'] : [])
      ];
      const guidance = (
        title: string,
        text: string,
        index: number,
        target?: HTMLElement | null
      ): PracticeGuidance => ({
        step: { title, text, phase: 'video', index },
        ...(target ? { hint: { target, title, body: text, side: 'left' as const } } : {}),
        milestones
      });
      if (root.querySelector('.is-collapsed'))
        return guidance(
          m.learningVideoTitle,
          m.practiceExpandPanel,
          1,
          root.querySelector<HTMLElement>('.surface-window')
        );
      if (markers.length < 2)
        return guidance(
          m.practiceVideoRecordTitle,
          markers.length ? m.practiceVideoRecordSecond : m.practiceVideoRecordFirst,
          1,
          root.querySelector<HTMLElement>('[data-action-id="video:add"]')
        );
      const remaining = markers.filter((_, index) => !visited.has(ids[index] ?? ''));
      if (remaining.length) {
        const marker =
          remaining.find((node) => Math.abs(markerTime(node) - video.currentTime) > 1) ??
          remaining[0];
        return guidance(
          m.practiceVideoSeekTitle,
          m.practiceVideoSeek.replace('{time}', marker?.textContent?.trim() ?? ''),
          2,
          marker
        );
      }
      if (toggle && (!removed || !restored || toggle.dataset.screenshotState !== 'on')) {
        const off = !removed && toggle.dataset.screenshotState !== 'off';
        return guidance(
          m.practiceVideoScreenshotTitle,
          off ? m.practiceVideoScreenshotOff : m.practiceVideoScreenshotOn,
          removed ? 4 : 3,
          toggle
        );
      }
      return guidance(
        m.videoPanelFinish,
        m.practiceVideoFinish,
        5,
        root.querySelector<HTMLElement>('[data-action-id="video:finish"]')
      );
    }
  };
}
