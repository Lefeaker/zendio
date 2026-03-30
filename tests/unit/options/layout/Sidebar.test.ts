/* @vitest-environment jsdom */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Sidebar } from '@options/components/layout/Sidebar';

describe('Sidebar', () => {
  let container: HTMLElement;
  let sidebar: Sidebar;

  beforeEach(() => {
    document.body.innerHTML = '';
    container = document.createElement('div');
    document.body.append(container);
    sidebar = new Sidebar(container);
  });

  it('renders brand details with logo and version tag', () => {
    sidebar.render({
      brand: {
        title: 'All in Obsidian',
        version: 'v1.2.3',
        logoUrl: '/logo.png'
      },
      navigation: { items: [{ id: 'usage', label: 'Usage' }], activeId: 'usage' },
      footerLinks: []
    });

    expect(container.querySelector('.aobx-sidebar__brand-title')?.textContent).toBe('All in Obsidian');
    expect(container.querySelector('.aobx-sidebar__brand-version')?.textContent).toBe('v1.2.3');
    expect(container.querySelector<HTMLImageElement>('img')?.src).toContain('/logo.png');
  });

  it('uses translated default navigation labels when messages are available', () => {
    sidebar.setMessages({
      usageDashboardTitle: 'Usage Dashboard',
      languageSettings: 'Language Settings',
      privacySettingsTitle: 'Privacy Settings',
      apiConfigTitle: 'REST Config',
      routingRulesTitle: 'Routing Rules',
      yamlConfigTitle: 'YAML Config',
      templateConfigTitle: 'Template Config',
      aiChatConfigTitle: 'AI Config',
      videoConfigTitle: 'Video Config',
      readingConfigTitle: 'Reading Config',
      fragmentConfigTitle: 'Fragment Config',
      configTransferTitle: 'Transfer Config',
      diagnosisTitle: 'Diagnosis'
    } as never);

    sidebar.render();

    const links = Array.from(container.querySelectorAll('.aobx-navigation__link')).map((item) => item.textContent);
    expect(links).toContain('Usage Dashboard');
    expect(links).toContain('Diagnosis');
  });

  it('configures footer links for external, internal, and dialog actions', () => {
    sidebar.render({
      navigation: { items: [{ id: 'usage', label: 'Usage' }] },
      footerLinks: [
        { label: 'Docs', href: 'https://example.com' },
        { label: 'Onboarding', href: '../onboarding/index.html' },
        { label: 'Support', id: 'supportLink' }
      ]
    });

    const links = container.querySelectorAll<HTMLAnchorElement>('.aobx-sidebar__link');
    expect(links[0]?.getAttribute('target')).toBe('_blank');
    expect(links[0]?.getAttribute('rel')).toBe('noopener noreferrer');
    expect(links[1]?.getAttribute('target')).toBeNull();
    expect(links[2]?.id).toBe('supportLink');
    expect(links[2]?.getAttribute('role')).toBe('button');
    expect(links[2]?.getAttribute('aria-haspopup')).toBe('dialog');
  });

  it('forwards active navigation updates to the child navigation component', () => {
    sidebar.render({
      navigation: { items: [{ id: 'usage', label: 'Usage' }], activeId: 'usage' },
      footerLinks: []
    });

    const navigation = (sidebar as unknown as { navigation: { setActive: (id: string) => void } }).navigation;
    const setActiveSpy = vi.spyOn(navigation, 'setActive');

    sidebar.setActiveNavigation('diagnosis');

    expect(setActiveSpy).toHaveBeenCalledWith('diagnosis');
  });
});
