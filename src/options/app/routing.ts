export type Bootstrapper = () => Promise<void>;

export function bootstrapPage(route: string, bootstrapper: Bootstrapper): void {
  const currentRoute = document.body?.dataset.route ?? 'options';
  if (currentRoute !== route) {
    return;
  }

  const run = () => {
    void bootstrapper();
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run, { once: true });
  } else {
    run();
  }
}
