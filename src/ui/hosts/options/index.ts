export function createOptionsMainHost(): HTMLElement {
  const main = document.createElement('main');
  main.className = 'aobx-content grid gap-[clamp(24px,3vw,36px)]';
  return main;
}

export function createOptionsSectionHost(sectionId: string): HTMLElement {
  const container = document.createElement('section');
  container.className = [
    'aobx-panel',
    'grid',
    'gap-3',
    'p-0',
    'rounded-lg',
    'border',
    'border-base-300',
    'shadow-none',
    'bg-base-100'
  ].join(' ');
  container.id = `section-${sectionId}`;
  container.dataset.navSection = '';
  return container;
}

export function markOptionsSectionMounted(container: HTMLElement, mounted: boolean): void {
  if (mounted) {
    container.dataset.sectionMounted = 'true';
    return;
  }
  delete container.dataset.sectionMounted;
}
