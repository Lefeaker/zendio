import { DEFAULT_RUNTIME_MESSAGES, type Messages } from '@i18n';
import { SETTINGS_GUIDE_BASICS, SETTINGS_GUIDE_SECTIONS } from '@shared/settingsGuide';
import { settingsTourSteps } from './settingsTourSteps';
import { createSettingsTourView } from './settingsTourView';

/** Presentation state only. The existing Options controllers own all edits and saves. */
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
  const params = new URL(location.href).searchParams;
  let steps = settingsTourSteps(options.getMessages() ?? DEFAULT_RUNTIME_MESSAGES, options.firefox);
  let index = steps.findIndex((step) => step.id === params.get('guide'));
  const initialStep = steps[index];
  if (!initialStep) return;
  let basic =
    params.get('guideMode') === 'basics' && SETTINGS_GUIDE_BASICS.includes(initialStep.id);
  let finished = false;
  let collapsed = false;
  let target: HTMLElement | null = null;
  let disposed = false;
  const view = createSettingsTourView(doc, {
    choose(value) {
      basic = value === '__basics';
      jump(steps.findIndex((step) => step.id === (basic ? SETTINGS_GUIDE_BASICS[0] : value)));
    },
    previous: () => advance(-1),
    next() {
      const step = steps[index];
      if (
        basic &&
        step &&
        SETTINGS_GUIDE_BASICS.indexOf(step.id) < SETTINGS_GUIDE_BASICS.length - 1
      )
        advance(1);
      else {
        finished = true;
        refresh();
        view.title.focus({ preventScroll: true });
      }
    },
    close: () => dispose(),
    locate: () => revealTarget(),
    toggle() {
      collapsed = !collapsed;
      doc.body.classList.toggle('settings-tour-collapsed', collapsed);
      refresh();
      if (!collapsed) revealTarget();
    }
  });
  function advance(offset: number) {
    const step = steps[index];
    if (!step) return;
    const nextId = SETTINGS_GUIDE_BASICS[SETTINGS_GUIDE_BASICS.indexOf(step.id) + offset];
    if (nextId) jump(steps.findIndex((item) => item.id === nextId));
  }
  function syncTarget() {
    const step = steps[index];
    if (!step) return;
    const section = options.root.querySelector<HTMLElement>(
      `[data-panel-id="${SETTINGS_GUIDE_SECTIONS[step.id]}"]`
    );
    const nextTarget = finished
      ? null
      : (section?.querySelector<HTMLElement>(step.selector) ?? null);
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
    view.render(m, {
      steps,
      step,
      basic,
      finished,
      collapsed,
      basicIndex: SETTINGS_GUIDE_BASICS.indexOf(step.id),
      basicCount: SETTINGS_GUIDE_BASICS.length
    });
    syncTarget();
  }
  function revealTarget() {
    target?.scrollIntoView({ block: 'start', inline: 'nearest', behavior: 'instant' });
  }
  function jump(nextIndex: number) {
    if (disposed || nextIndex < 0) return;
    index = nextIndex;
    finished = false;
    refresh();
    const step = steps[index];
    if (!step) return;
    const url = new URL(location.href);
    url.searchParams.set('guide', step.id);
    if (basic) url.searchParams.set('guideMode', 'basics');
    else url.searchParams.delete('guideMode');
    url.hash = 'section-' + SETTINGS_GUIDE_SECTIONS[step.id];
    history.replaceState(null, '', url);
    options.scrollToPanel(SETTINGS_GUIDE_SECTIONS[step.id]);
    revealTarget();
    view.root.scrollTop = 0;
    if (!collapsed) view.title.focus({ preventScroll: true });
  }
  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    if (event.target instanceof Element && event.target.closest('[role="dialog"]')) return;
    event.preventDefault();
    dispose();
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    observer.disconnect();
    win?.removeEventListener('resize', revealTarget);
    doc.removeEventListener('keydown', onKeyDown);
    target?.classList.remove('settings-tour-target');
    doc.body.classList.remove('settings-tour-active', 'settings-tour-collapsed');
    view.root.remove();
    const url = new URL(location.href);
    url.searchParams.delete('guide');
    url.searchParams.delete('guideMode');
    history.replaceState(null, '', url);
  }
  const observer = new MutationObserver(syncTarget);
  observer.observe(options.root, { childList: true, subtree: true });
  doc.body.append(view.root);
  doc.body.classList.add('settings-tour-active');
  doc.addEventListener('keydown', onKeyDown);
  win.addEventListener('resize', revealTarget);
  jump(index);
  return {
    dispose,
    refresh,
    navigateToPanel(panelId: string): boolean {
      if (disposed) return false;
      const nextIndex = steps.findIndex((step) => SETTINGS_GUIDE_SECTIONS[step.id] === panelId);
      if (nextIndex < 0) return false;
      basic = false;
      jump(nextIndex);
      return true;
    }
  };
}
