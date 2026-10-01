import { DEFAULT_RUNTIME_MESSAGES, type Messages } from '@i18n';
import { createPrimitiveButtonElement } from '@ui/primitives/button';
import { SETTINGS_GUIDE_SECTIONS } from '@shared/settingsGuide';
import { settingsTourSteps } from './settingsTourSteps';

/** Presentation only: navigation and highlighting leave the Options persistence owner in charge. */
export function mountSettingsTour(options: {
  root: HTMLElement;
  firefox: boolean;
  getMessages(): Messages | null;
  scrollToPanel(id: string): void;
}) {
  const doc = options.root.ownerDocument;
  const win = doc.defaultView;
  if (!win) return;
  const { location, history } = win;
  const requested = new URL(location.href).searchParams.get('guide');
  if (!requested || !(requested in SETTINGS_GUIDE_SECTIONS)) return;
  let steps = settingsTourSteps(options.getMessages() ?? DEFAULT_RUNTIME_MESSAGES, options.firefox);
  let index = steps.findIndex((step) => step.id === requested);
  if (index < 0) return;
  let target: HTMLElement | null = null;
  let disposed = false;
  const panel = doc.createElement('aside');
  panel.id = 'settingsTour';
  panel.className = 'settings-tour';
  const eyebrow = doc.createElement('p');
  const select = doc.createElement('select');
  select.id = 'settingsTourTopics';
  const count = doc.createElement('p');
  count.className = 'settings-tour-count';
  const title = doc.createElement('h2');
  title.id = 'settingsTourTitle';
  title.tabIndex = -1;
  panel.setAttribute('aria-labelledby', title.id);
  const copy = doc.createElement('div');
  copy.className = 'settings-tour-copy';
  const hint = doc.createElement('p');
  hint.className = 'settings-tour-hint';
  const actions = doc.createElement('div');
  actions.className = 'settings-tour-actions';
  const button = (action: () => void) =>
    createPrimitiveButtonElement({
      label: '',
      onClick: action,
      classSlots: ['btn', 'secondary']
    });
  const previous = button(() => jump(index - 1));
  previous.id = 'settingsTourPrevious';
  const next = button(() => (index === steps.length - 1 ? dispose() : jump(index + 1)));
  next.id = 'settingsTourNext';
  next.classList.replace('secondary', 'primary');
  const close = button(() => dispose());
  close.id = 'settingsTourClose';
  actions.append(previous, next, close);
  panel.append(eyebrow, select, count, title, copy, hint, actions);

  function syncTarget() {
    const step = steps[index];
    if (!step) return;
    const section = options.root.querySelector<HTMLElement>(
      `[data-panel-id="${SETTINGS_GUIDE_SECTIONS[step.id]}"]`
    );
    const nextTarget = section?.querySelector<HTMLElement>(step.selector) ?? section ?? null;
    if (nextTarget === target) return;
    target?.classList.remove('settings-tour-target');
    target = nextTarget;
    target?.classList.add('settings-tour-target');
  }
  function refresh() {
    if (disposed) return;
    const m = options.getMessages() ?? DEFAULT_RUNTIME_MESSAGES;
    steps = settingsTourSteps(m, options.firefox);
    const step = steps[index];
    if (!step) return;
    eyebrow.textContent = m.settingsTourTitle;
    select.setAttribute('aria-label', m.settingsTourTitle);
    select.replaceChildren(
      ...steps.map((item) => {
        const option = doc.createElement('option');
        option.value = item.id;
        option.textContent = item.title;
        return option;
      })
    );
    select.value = step.id;
    count.textContent = `${index + 1} / ${steps.length}`;
    title.textContent = step.title;
    copy.replaceChildren(
      ...step.text.map((text) => {
        const p = doc.createElement('p');
        p.textContent = text;
        return p;
      })
    );
    if (step.link) {
      const link = doc.createElement('a');
      link.textContent = step.link[0] ?? '';
      link.href = step.link[1] ?? '';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      copy.append(link);
    }
    hint.textContent = m.settingsTourHint;
    previous.textContent = m.settingsTourPrevious;
    previous.disabled = index === 0;
    next.textContent = index === steps.length - 1 ? m.completeOnboarding : m.settingsTourNext;
    close.textContent = m.settingsTourExit;
    syncTarget();
  }
  function jump(nextIndex: number) {
    index = Math.max(0, Math.min(steps.length - 1, nextIndex));
    refresh();
    const step = steps[index];
    if (!step) return;
    const url = new URL(location.href);
    url.searchParams.set('guide', step.id);
    url.hash = 'section-' + SETTINGS_GUIDE_SECTIONS[step.id];
    history.replaceState(null, '', url);
    options.scrollToPanel(SETTINGS_GUIDE_SECTIONS[step.id]);
    target?.scrollIntoView({ block: 'center', behavior: 'instant' });
    title.focus({ preventScroll: true });
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    win?.removeEventListener('resize', revealTarget);
    target?.classList.remove('settings-tour-target');
    doc.body.classList.remove('settings-tour-active');
    panel.remove();
    const url = new URL(location.href);
    url.searchParams.delete('guide');
    history.replaceState(null, '', url);
  }
  select.addEventListener('change', () =>
    jump(steps.findIndex((step) => step.id === select.value))
  );
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      dispose();
    }
  });
  // Only section replacement matters; do not observe our own highlight classes or the guide.
  const observer = new MutationObserver(syncTarget);
  observer.observe(options.root, { childList: true, subtree: true });
  doc.body.append(panel);
  doc.body.classList.add('settings-tour-active');
  function revealTarget() {
    target?.scrollIntoView({ block: 'center', behavior: 'instant' });
  }
  win.addEventListener('resize', revealTarget);
  jump(index);
  return { dispose, refresh };
}
