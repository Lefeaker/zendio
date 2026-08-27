import { chromium, expect, test, type BrowserContext, type Page } from '@playwright/test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const extensionPath = path.resolve(process.env.PLAYWRIGHT_DIST_DIR ?? 'build/dist');
const canonicalByTheme = {
  dark: {
    canonical: {
      bg: '#09090b',
      text: '#fafafa',
      accent: '#a78bfa',
      line: '#27272a',
      radius: '8px',
      motion: '140ms'
    },
    probe: {
      background: 'rgb(9, 9, 11)',
      color: 'rgb(250, 250, 250)',
      line: 'rgb(39, 39, 42)'
    },
    colorScheme: 'dark'
  },
  light: {
    canonical: {
      bg: '#f5f6fb',
      text: '#111114',
      accent: '#7c3aed',
      line: '#e4e4eb',
      radius: '8px',
      motion: '140ms'
    },
    probe: {
      background: 'rgb(245, 246, 251)',
      color: 'rgb(17, 17, 20)',
      line: 'rgb(228, 228, 235)'
    },
    colorScheme: 'light'
  }
} as const;

async function collectShadowSurfaceStyles(page: Page, css: string, theme: 'dark' | 'light') {
  return page.evaluate(
    async ({ stylesheet, selectedTheme }) => {
      const tokenNames = [
        '--zendio-stitch-bg',
        '--zendio-stitch-text',
        '--zendio-stitch-accent',
        '--zendio-stitch-line',
        '--zendio-stitch-radius-md',
        '--zendio-stitch-motion-fast'
      ];
      const read = (hostile: boolean) => {
        for (const node of [document.documentElement, document.body]) {
          for (const name of tokenNames) node.style.removeProperty(name);
        }
        const host = document.createElement('div');
        if (hostile) {
          const hostileValues = ['#ff00ff', '#00ff00', '#ff0000', '#00ffff', '99px', '900s'];
          for (const node of [document.documentElement, document.body, host]) {
            tokenNames.forEach((name, index) => {
              node.style.setProperty(name, hostileValues[index] ?? 'initial');
            });
          }
        }
        const shadow = host.attachShadow({ mode: 'open' });
        const style = document.createElement('style');
        style.textContent = stylesheet;
        const surface = document.createElement('section');
        surface.className = 'stitch-runtime-surface';
        surface.dataset.previewTheme = selectedTheme;
        surface.innerHTML = `
          <div data-token-probe style="background: var(--bg); color: var(--text); border: 1px solid var(--line)">
            Token probe
          </div>
          <button class="btn primary" type="button">Save</button>
        `;
        shadow.append(style, surface);
        document.body.append(host);
        const surfaceStyle = getComputedStyle(surface);
        const probe = surface.querySelector<HTMLElement>('[data-token-probe]');
        const button = surface.querySelector<HTMLButtonElement>('button');
        if (!probe || !button) throw new Error('Missing shadow token probes');
        const probeStyle = getComputedStyle(probe);
        const buttonStyle = getComputedStyle(button);
        const result = {
          canonical: {
            bg: surfaceStyle.getPropertyValue('--zendio-stitch-bg').trim(),
            text: surfaceStyle.getPropertyValue('--zendio-stitch-text').trim(),
            accent: surfaceStyle.getPropertyValue('--zendio-stitch-accent').trim(),
            line: surfaceStyle.getPropertyValue('--zendio-stitch-line').trim(),
            radius: surfaceStyle.getPropertyValue('--zendio-stitch-radius-md').trim(),
            motion: surfaceStyle.getPropertyValue('--zendio-stitch-motion-fast').trim()
          },
          probe: {
            background: probeStyle.backgroundColor,
            color: probeStyle.color,
            line: probeStyle.borderTopColor
          },
          button: {
            background: buttonStyle.backgroundColor,
            color: buttonStyle.color,
            radius: buttonStyle.borderRadius,
            minHeight: buttonStyle.minHeight,
            transitionDuration: buttonStyle.transitionDuration
          },
          colorScheme: surfaceStyle.colorScheme
        };
        host.remove();
        for (const node of [document.documentElement, document.body]) {
          for (const name of tokenNames) node.style.removeProperty(name);
        }
        return result;
      };
      return { missing: read(false), adversarial: read(true) };
    },
    { stylesheet: css, selectedTheme: theme }
  );
}

test('idle content loads zero packs and the first feature requests one exact flattened pack', async () => {
  const userDataDir = await mkdtemp(path.join(tmpdir(), 'zendio-u03-content-css-'));
  let context: BrowserContext | null = null;
  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: false,
      args: [
        '--headless=new',
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`
      ]
    });
    const background = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
    const extensionId = background.url().split('/')[2];
    if (!extensionId) throw new Error('Unable to resolve extension id');
    const packRequests: string[] = [];
    context.on('request', (request) => {
      if (request.url().includes('/ui/stitch-runtime/styles/')) packRequests.push(request.url());
    });
    const page = await context.newPage();
    const port = process.env.PLAYWRIGHT_WEB_SERVER_PORT ?? '43103';
    await page.goto(`http://127.0.0.1:${port}/manifest.json`, {
      waitUntil: 'domcontentloaded'
    });
    await page.waitForTimeout(250);
    expect(packRequests).toEqual([]);

    const packUrl = `chrome-extension://${extensionId}/ui/stitch-runtime/styles/clipper.css`;
    const css = await page.evaluate(async (url) => (await fetch(url)).text(), packUrl);
    expect(css).not.toMatch(/^\s*@import\b/m);
    expect(packRequests).toEqual([packUrl]);

    for (const theme of ['dark', 'light'] as const) {
      const snapshots = await collectShadowSurfaceStyles(page, css, theme);
      expect(snapshots.adversarial).toEqual(snapshots.missing);
      expect(snapshots.missing.canonical).toEqual(canonicalByTheme[theme].canonical);
      expect(snapshots.missing.probe).toEqual(canonicalByTheme[theme].probe);
      expect(snapshots.missing.colorScheme).toBe(canonicalByTheme[theme].colorScheme);
      expect(snapshots.missing.button).toMatchObject({
        radius: '8px',
        minHeight: '36px'
      });
      expect(snapshots.missing.button.background).not.toBe('rgb(255, 0, 0)');
      expect(snapshots.missing.button.color).not.toBe('rgb(0, 255, 0)');
      expect(snapshots.missing.button.transitionDuration).not.toContain('900s');
    }
  } finally {
    await context?.close();
  }
});
