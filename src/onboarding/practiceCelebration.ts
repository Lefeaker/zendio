/** Transient visual feedback only: completion still belongs to the real UI and save receipt. */
export function createPracticeCelebration() {
  const layer = document.createElement('div');
  layer.className = 'practice-celebration';
  layer.setAttribute('aria-hidden', 'true');
  const seen = new Set<string>();
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let initialized = false;
  let cleanup: ReturnType<typeof setTimeout> | undefined;
  const clear = () => {
    clearTimeout(cleanup);
    cleanup = undefined;
    layer.replaceChildren();
    delete layer.dataset.milestone;
  };
  const onMotionChange = () => {
    if (motion.matches) clear();
  };
  motion.addEventListener('change', onMotionChange);
  return {
    layer,
    sync: (milestones: string[], anchor: HTMLElement) => {
      const fresh = milestones.filter((key) => !seen.has(key));
      milestones.forEach((key) => seen.add(key));
      // Restoring an already completed lesson is not a new accomplishment.
      if (!initialized) {
        initialized = true;
        return;
      }
      const milestone = fresh.at(-1);
      if (!milestone || motion.matches || document.visibilityState === 'hidden') return;
      clear();
      const rect = anchor.getBoundingClientRect();
      const x = Math.max(60, Math.min(innerWidth - 60, rect.left + rect.width / 2));
      const y = Math.max(100, Math.min(innerHeight - 80, rect.top + rect.height / 2));
      layer.style.left = x + 'px';
      layer.style.top = y + 'px';
      layer.dataset.milestone = milestone;
      const palette = [
        'var(--accent)',
        'var(--success)',
        'var(--warning)',
        'var(--accent-end)',
        'var(--violet)'
      ];
      const count = milestone === 'saved' ? 44 : 24;
      const bits = Array.from({ length: count }, (_, index) => {
        const bit = document.createElement('span');
        bit.className = 'practice-confetti-bit';
        const angle = -Math.PI + (index / (count - 1)) * Math.PI;
        const distance = 65 + Math.random() * 95;
        bit.style.setProperty('--confetti-x', Math.cos(angle) * distance + 'px');
        bit.style.setProperty('--confetti-y', Math.sin(angle) * distance - 25 + 'px');
        bit.style.setProperty('--confetti-fall', 75 + Math.random() * 75 + 'px');
        bit.style.setProperty(
          '--confetti-spin',
          (index % 2 ? 1 : -1) * (180 + Math.random() * 360) + 'deg'
        );
        bit.style.background = palette[index % palette.length] ?? 'var(--accent)';
        bit.style.animationDelay = (index % 5) * 18 + 'ms';
        return bit;
      });
      layer.replaceChildren(...bits);
      cleanup = setTimeout(clear, 1500);
    },
    dispose() {
      clear();
      motion.removeEventListener('change', onMotionChange);
      layer.remove();
    }
  };
}
