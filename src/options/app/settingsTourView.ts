import type { Messages } from '@i18n';
import { createPrimitiveButtonElement } from '@ui/primitives/button';
import { SETTINGS_GUIDE_SECTIONS } from '@shared/settingsGuide';
import { SETTINGS_TOUR_GROUPS, type SettingsTourStep } from './settingsTourSteps';

/** Guide presentation only; controls and configuration stay in the Options page. */
export function createSettingsTourView(
  doc: Document,
  actions: {
    choose: (value: string) => void;
    previous: () => void;
    next: () => void;
    close: () => void;
    locate: () => void;
    toggle: () => void;
  }
) {
  const node = <K extends keyof HTMLElementTagNameMap>(tag: K, className = '') => {
    const element = doc.createElement(tag);
    element.className = className;
    return element;
  };
  const button = (id: string, onClick: () => void, primary = false) => {
    const b = createPrimitiveButtonElement({
      label: '',
      onClick,
      classSlots: ['btn', primary ? 'primary' : 'secondary']
    });
    b.id = id;
    return b;
  };
  const root = node('aside', 'settings-tour');
  root.id = 'settingsTour';
  const toolbar = node('div', 'settings-tour-toolbar');
  const toggle = button('settingsTourToggle', actions.toggle);
  const close = button('settingsTourClose', actions.close);
  toolbar.append(toggle, close);
  const content = node('div', 'settings-tour-content');
  content.id = 'settingsTourContent';
  toggle.setAttribute('aria-controls', content.id);
  const select = node('select');
  select.id = 'settingsTourTopics';
  select.addEventListener('change', () => actions.choose(select.value));
  const count = node('p', 'settings-tour-count');
  const title = node('h2');
  title.id = 'settingsTourTitle';
  title.tabIndex = -1;
  root.setAttribute('aria-labelledby', title.id);
  const copy = node('div', 'settings-tour-copy');
  const hint = node('p', 'settings-tour-hint');
  const buttons = node('div', 'settings-tour-actions');
  const previous = button('settingsTourPrevious', actions.previous);
  const next = button('settingsTourNext', actions.next, true);
  const locate = button('settingsTourLocate', actions.locate);
  const verify = node('a', 'btn primary');
  verify.id = 'settingsTourVerify';
  verify.target = '_blank';
  verify.rel = 'noopener';
  buttons.append(previous, next, verify, locate);
  content.append(select, count, title, copy, hint, buttons);
  root.append(toolbar, content);
  return {
    root,
    title,
    select,
    render(
      m: Messages,
      state: {
        steps: SettingsTourStep[];
        step: SettingsTourStep;
        basicIndex: number;
        basicCount: number;
        basic: boolean;
        finished: boolean;
        collapsed: boolean;
      }
    ) {
      toggle.textContent = state.collapsed ? m.settingsTourExpand : m.settingsTourCollapse;
      toggle.setAttribute('aria-expanded', String(!state.collapsed));
      content.hidden = state.collapsed;
      close.textContent = m.settingsTourExit;
      select.setAttribute('aria-label', m.settingsTourTitle);
      const start = node('option');
      start.value = '__basics';
      start.textContent = m.settingsTourBasics;
      select.replaceChildren(start);
      for (const [section, label] of Object.entries(SETTINGS_TOUR_GROUPS)) {
        const group = node('optgroup');
        group.label = m[label];
        for (const step of state.steps.filter(
          (step) => SETTINGS_GUIDE_SECTIONS[step.id] === section
        )) {
          const option = node('option');
          option.value = step.id;
          option.textContent = step.title;
          group.append(option);
        }
        select.append(group);
      }
      select.value = state.step.id;
      count.textContent = state.basic
        ? `${m.settingsTourBasics} · ${state.basicIndex + 1} / ${state.basicCount}`
        : m.settingsTourTopic;
      title.textContent = state.finished ? m.settingsTourFinishTitle : state.step.title;
      copy.replaceChildren(
        ...(state.finished ? [m.settingsTourFinishHint] : state.step.text).map((text) => {
          const p = node('p');
          p.textContent = text;
          return p;
        })
      );
      if (!state.finished && state.step.link) {
        const link = node('a');
        link.textContent = state.step.link[0];
        link.href = state.step.link[1];
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        copy.append(link);
      }
      hint.textContent = m.settingsTourHint;
      hint.hidden = state.finished;
      previous.hidden = state.finished || !state.basic;
      previous.disabled = state.basicIndex === 0;
      previous.textContent = m.settingsTourPrevious;
      next.hidden = state.finished;
      next.textContent =
        state.basic && state.basicIndex < state.basicCount - 1
          ? m.settingsTourNext
          : m.settingsTourTopicDone;
      locate.textContent = m.settingsTourLocate;
      locate.hidden = state.finished;
      verify.hidden = !state.finished;
      verify.textContent = m.settingsTourVerify;
      verify.href =
        state.step.practice === 'library'
          ? '../onboarding/index.html'
          : `../onboarding/practice.html?lesson=${state.step.practice}&run=${crypto.randomUUID()}`;
    }
  };
}
