import { mountPreviewApp } from '../app/runtime';

function bootstrap(): void {
  mountPreviewApp({ rootId: 'app', mode: 'main' });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
} else {
  bootstrap();
}
