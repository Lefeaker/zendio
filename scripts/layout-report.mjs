import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { build } from 'esbuild';
import { JSDOM, VirtualConsole } from 'jsdom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const DIST_ROOT = path.join(ROOT, 'build', 'dist');
const REPORT_DIR = path.join(ROOT, 'build', 'reports');
const OUTPUT_FILE = path.join(REPORT_DIR, 'layout-issues.json');

async function bundleModule(filePath) {
  const result = await build({
    entryPoints: [filePath],
    platform: 'node',
    format: 'esm',
    bundle: true,
    write: false,
    target: 'node20',
    logLevel: 'silent'
  });
  const { text } = result.outputFiles[0];
  const dataUrl = `data:text/javascript;base64,${Buffer.from(text).toString('base64')}`;
  return import(dataUrl);
}

async function loadDependencies() {
  const layoutInspectorModule = await bundleModule(path.join(ROOT, 'tools/layout-inspector.ts'));
  const pageControllerModule = await bundleModule(path.join(ROOT, 'src/i18n/pageController.ts'));
  const domBindingModule = await bundleModule(path.join(ROOT, 'src/i18n/adapters/domBindingAdapter.ts'));
  const localesModule = await bundleModule(path.join(ROOT, 'src/i18n/locales.ts'));
  const configModule = await bundleModule(path.join(ROOT, 'src/i18n/config.ts'));

  return {
    LayoutInspector: layoutInspectorModule.LayoutInspector,
    createPageI18nController: pageControllerModule.createPageI18nController,
    createDomBindingAdapter: domBindingModule.createDomBindingAdapter,
    getLocaleCodes: localesModule.getLocaleCodes,
    loadMessagesWithFallback: localesModule.loadMessagesWithFallback,
    DEFAULT_LANGUAGE: localesModule.DEFAULT_LANGUAGE,
    resolveLanguage: configModule.resolveLanguage
  };
}

function defineGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value
  });
}

function setupWindow(dom) {
  const { window } = dom;
  defineGlobal('window', window);
  defineGlobal('document', window.document);
  defineGlobal('navigator', window.navigator);
  defineGlobal('HTMLElement', window.HTMLElement);
  defineGlobal('HTMLInputElement', window.HTMLInputElement);
  defineGlobal('HTMLTextAreaElement', window.HTMLTextAreaElement);
  defineGlobal('HTMLSelectElement', window.HTMLSelectElement);
  defineGlobal('Element', window.Element);
  defineGlobal('Node', window.Node);
  defineGlobal('MutationObserver', window.MutationObserver);
  defineGlobal('getComputedStyle', window.getComputedStyle.bind(window));
  defineGlobal('requestAnimationFrame', window.requestAnimationFrame.bind(window));
  defineGlobal('cancelAnimationFrame', window.cancelAnimationFrame.bind(window));
}

function cleanupWindow(dom) {
  dom.window.close();
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'document');
  Reflect.deleteProperty(globalThis, 'navigator');
  Reflect.deleteProperty(globalThis, 'HTMLElement');
  Reflect.deleteProperty(globalThis, 'HTMLInputElement');
  Reflect.deleteProperty(globalThis, 'HTMLTextAreaElement');
  Reflect.deleteProperty(globalThis, 'HTMLSelectElement');
  Reflect.deleteProperty(globalThis, 'Element');
  Reflect.deleteProperty(globalThis, 'Node');
  Reflect.deleteProperty(globalThis, 'MutationObserver');
  Reflect.deleteProperty(globalThis, 'getComputedStyle');
  Reflect.deleteProperty(globalThis, 'requestAnimationFrame');
  Reflect.deleteProperty(globalThis, 'cancelAnimationFrame');
}

async function inspectPage(htmlPath, languages, deps) {
  const html = await fs.readFile(htmlPath, 'utf8');
  const results = [];

  for (const language of languages) {
    const virtualConsole = new VirtualConsole();
    virtualConsole.on('jsdomError', (error) => {
      if (error?.message?.startsWith('Could not parse CSS stylesheet')) {
        return;
      }
      console.warn('[layout-report:jsdom]', error?.message ?? error);
    });

    const dom = new JSDOM(html, {
      url: 'https://allinob.local/options',
      pretendToBeVisual: true,
      virtualConsole
    });

    setupWindow(dom);

    const bindingAdapter = deps.createDomBindingAdapter();
    const resolved = deps.resolveLanguage(language);
    const controller = deps.createPageI18nController({
      bindingAdapter,
      defaultLanguage: deps.DEFAULT_LANGUAGE,
      loadMessages: async (lang) => deps.loadMessagesWithFallback(deps.resolveLanguage(lang)),
      async getCurrentLanguage() {
        return resolved;
      },
      async setCurrentLanguage() {
        /* noop for report */
      }
    });

    await controller.load(resolved);
    controller.mount(dom.window.document);

    const inspector = new deps.LayoutInspector(dom.window.document);
    const issues = inspector.inspect(language);
    results.push(...issues.map(issue => ({
      ...issue,
      page: path.basename(htmlPath)
    })));

    controller.dispose();
    cleanupWindow(dom);
  }

  return results;
}

async function ensureBuildExists() {
  try {
    await fs.access(path.join(DIST_ROOT, 'options', 'index.html'));
  } catch (error) {
    throw new Error('请先运行 npm run build:dev 或 npm run build 生成 build/dist 再执行 npm run layout:report');
  }
}

async function main() {
  await ensureBuildExists();
  const deps = await loadDependencies();

  const allLanguages = deps.getLocaleCodes().filter((code) => code !== 'qps-ploc');

  const pages = [{
    name: 'options/index.html',
    path: path.join(DIST_ROOT, 'options', 'index.html')
  }];

  const report = {
    generatedAt: new Date().toISOString(),
    issues: []
  };

  for (const page of pages) {
    const issues = await inspectPage(page.path, allLanguages, deps);
    report.issues.push(...issues);
  }

  const highSeverity = report.issues.filter((issue) => issue.priority === 'high');

  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(OUTPUT_FILE, JSON.stringify(report, null, 2), 'utf8');

  console.log(`布局巡检完成，共发现 ${report.issues.length} 个问题，已写入 ${path.relative(ROOT, OUTPUT_FILE)}`);
  if (highSeverity.length > 0) {
    console.warn(`检测到 ${highSeverity.length} 个高优先级布局问题。`);
    highSeverity.forEach((issue) => {
      console.warn(`- [${issue.language}] ${issue.selector} (${issue.issue})`);
    });
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('[layout-report] 生成失败');
  console.error(error);
  process.exitCode = 1;
});
