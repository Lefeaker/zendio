结论先说：你的重构方向是对的（拆分语言文件、集中键集合、基于配置生成类型与清单、未知语种回退）。如果你要扩到 10+ 语言，建议在“Chrome 扩展的原生 i18n + 运行时 i18n”两条线都打通，并把“键完整性、复数/变量插值、RTL、区域回退、生成 \_locales/”一次性纳入。下面给出一套可落地的补强清单与关键代码骨架。

⸻

需要补强的 10 点（按优先级）1. 双通道 i18n 结构
• 静态（Chrome 原生）：面向 manifest.json、action 标题、contextMenus 等，用 \_locales/_/messages.json + chrome.i18n.getMessage()。
• 运行时（你的 TS 模块）：面向 UI/业务文案，用 typed messages + 插值/复数。
✅ 关键：用脚本从 TS 源自动生成 \_locales/_/messages.json，避免双维护。2. 标准化语言代码 & 回退链（BCP-47）
• 统一使用 en, zh-CN, zh-TW, es-ES/es-419, pt-BR, ru, ja, de, fr, ko, it…
• 回退算法：userChoice → navigator.language → base(lang)（如 es-419 → es）→ DEFAULT_LANGUAGE（建议 en）。3. Typed keys “以英文为准”
• type Messages = typeof en; 其它语言 satisfies Messages，编译期报缺失/多余键。
• 保持键命名扁平或“模块.子键”式（settings.appearance.theme），不要混放 UI 与错误码。4. 占位符与复数
• 运行时采用 ICU/MessageFormat（如 Hello, {name}! You have {n, plural, one{# note} other{# notes}}）。
• 生成 \_locales/messages.json 时转成 Chrome 占位符（$1…）版本的简化串（仅用于菜单、标题等不含复数的静态文案）。5. RTL 支持（为以后阿拉伯语/希伯来语留余地）
• LANGUAGE_CONFIG 加 dir: 'ltr' | 'rtl'。
• UI 根节点动态加 dir 属性；CSS 用逻辑属性（margin-inline-start 等）。6. 懒加载与 MV3 约束
• 运行时消息按语言动态 import()，cache 到内存；不要在 service worker 里引大型 i18n 库。
• 内容脚本、options/popup 页面各自初始化，尽量复用共享模块。7. 用户选择与同步
• chrome.storage.sync 存 language；默认 navigator.language。提供“跟随浏览器语言/手动选择”开关。8. 校验与 CI
• 校验三件套：
a) 键缺失/多余（以 en 为准）；
b) 占位符对齐（每个 {name}、$1 都必须在各语言存在）；
c) 危险 HTML（可选规则，禁止 <script> 等）。9. 伪本地化（Pseudo-loc）
• 提供一个 qps-ploc 语言：拉长文本、加重音符，提早暴露溢出/未翻译问题。10. “静态 vs 运行时”键域拆分

    •	为 _locales 单独维护 小而稳定的键域：扩展名、描述、菜单、快捷提示；
    •	其余 UI 走运行时 keys，避免 _locales 爆炸。

⸻

参考目录结构（在你现有基础上微调）

src/i18n/
messages.ts # 键集合/工具类型（以 en 为准）
index.ts # t()、loadLocale()、formatter 工具
dynamicMessages.ts # 仍保留，但改为 MessageFormat 工厂
config.ts # LANGUAGE*CONFIG（code/label/dir/aliases）
catalog/messages/
en/runtime.json
en/static.json
en/schema.json
zh-CN/runtime.json
...
generated/locales/
en.generated.ts
zh-CN.generated.ts
...
scripts/
i18n:catalog:generate # 从 catalog/messages/* 生成 generated locale modules 与 public/_locales
lint-i18n.ts # 键/占位符/HTML 校验
\_locales/ # 由脚本生成（不要手改）
en/messages.json
zh_CN/messages.json
ja/messages.json

⸻

关键代码骨架

1. 语言配置 & 回退

// src/i18n/config.ts
export type LangCode =
| 'en' | 'zh-CN' | 'zh-TW' | 'ja' | 'ru' | 'es-ES' | 'es-419'
| 'pt-BR' | 'de' | 'fr' | 'ko' | 'it';

export const DEFAULT_LANGUAGE: LangCode = 'en';

export const LANGUAGE_CONFIG: Record<LangCode, {
label: string;
dir: 'ltr' | 'rtl';
aliases?: string[]; // e.g. ['es', 'es-MX'] → 指向 es-419 或 es-ES
}> = {
en: { label: 'English', dir: 'ltr', aliases: ['en-US', 'en-GB'] },
'zh-CN': { label: '简体中文', dir: 'ltr', aliases: ['zh', 'zh-Hans'] },
'zh-TW': { label: '繁體中文', dir: 'ltr', aliases: ['zh-Hant'] },
ja: { label: '日本語', dir: 'ltr' },
ru: { label: 'Русский', dir: 'ltr' },
'es-ES':{ label: 'Español (ES)', dir: 'ltr', aliases: ['es'] },
'es-419':{ label: 'Español (LatAm)', dir: 'ltr', aliases: ['es-MX','es-AR'] },
'pt-BR':{ label: 'Português (BR)', dir: 'ltr', aliases: ['pt'] },
de: { label: 'Deutsch', dir: 'ltr' },
fr: { label: 'Français', dir: 'ltr' },
ko: { label: '한국어', dir: 'ltr' },
it: { label: 'Italiano', dir: 'ltr' },
};

2. 以英文为准的类型锚

// src/i18n/catalog/messages/en/runtime.json
export const en = {
common: {
ok: 'OK',
cancel: 'Cancel',
loading: 'Loading…'
},
helloUser: 'Hello, {name}!',
notesCount: 'You have {n, plural, one {# note} other {# notes}}.'
} as const;
export type Messages = typeof en;

// src/i18n/messages.ts
export type { Messages } from './locales/en';

// 强制其它语言满足 Messages
export type LocaleModule = { default: Messages };

3. 动态加载 + t()

// src/i18n/index.ts
import { DEFAULT_LANGUAGE, LANGUAGE_CONFIG, type LangCode } from './config';

let currentLang: LangCode = DEFAULT_LANGUAGE;
let messages: any = null;

export async function loadLocale(langLike?: string) {
const resolved = resolveLang(langLike);
currentLang = resolved;
messages = (await import(`./locales/${resolved}.ts`)).default;
document.documentElement.setAttribute('lang', resolved);
document.documentElement.setAttribute('dir', LANGUAGE_CONFIG[resolved].dir);
}

export function resolveLang(input?: string): LangCode {
const norm = (input || navigator.language || DEFAULT_LANGUAGE);
// 完整匹配 → alias → base 语言 → 默认
const hit = (Object.keys(LANGUAGE_CONFIG) as LangCode[]).find(l => l === norm)
?? (Object.entries(LANGUAGE_CONFIG).find(([,v]) => v.aliases?.includes(norm))?.[0] as LangCode | undefined)
?? (Object.keys(LANGUAGE_CONFIG) as LangCode[]).find(l => l.split('-')[0] === norm.split('-')[0])
?? DEFAULT_LANGUAGE;
return hit;
}

export function t(path: string, vars?: Record<string, unknown>): string {
const val = path.split('.').reduce((acc, k) => acc?.[k], messages) as string | undefined;
if (!val) return path; // 安全回退：未翻译直接显示 key
return formatICU(val, vars); // 用 messageformat/formatjs 的轻量运行时
}

运行时格式化可选用 @formatjs/icu-messageformat-parser + 一个轻量执行器，或你现有的 dynamicMessages.ts 工厂。

4. 生成 \_locales/\*/messages.json 脚本（简化版）

// scripts/gen-locales.ts (node)
import fs from 'node:fs/promises';
import path from 'node:path';

const OUT = path.resolve('\_locales');

const STATIC_KEYS = {
extName: 'AiiinOB – Obsidian Helper',
extDesc: 'Enhance your Obsidian workflow in Chrome.',
menuCapture: 'Capture to Obsidian'
} as const;

const MAP: Record<string, string> = {
'zh-CN': 'zh_CN',
'zh-TW': 'zh_TW',
'pt-BR': 'pt_BR',
'es-ES': 'es',
'es-419': 'es_419'
};

async function run() {
const localesDir = path.resolve('src/i18n/locales');
const files = await fs.readdir(localesDir);
await fs.mkdir(OUT, { recursive: true });

for (const f of files) {
if (!f.endsWith('.ts')) continue;
const code = f.replace(/\.ts$/, '');
const chromeCode = MAP[code] ?? code;

    // 这里只导出静态键：避免把 ICU 串硬塞进 Chrome 消息（Chrome 不支持复数）
    const msgs = await toChromeMessages(code, STATIC_KEYS);

    const dir = path.join(OUT, chromeCode);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, 'messages.json'), JSON.stringify(msgs, null, 2), 'utf8');

}
}

async function toChromeMessages(code: string, statics: Record<string, string>) {
// 实际生产建议读取每种语言自己的静态区（如 locales/<lang>.static.ts）
// 这里示例直接用英语键作为 key，其他语言你可在各自文件放对应翻译
const mod = await import(path.resolve(`../src/i18n/generated/locales/${code}.generated.ts`));
const dict: Record<string, any> = {};
for (const [k, enValue] of Object.entries(statics)) {
const v = mod.default?.static?.[k] ?? enValue; // 各语言可选的 static 字段
dict[k] = { message: v };
}
return dict;
}

run().catch(e => { console.error(e); process.exit(1); });

小技巧：在每个语言文件里新增一个 static 分区只存用于 Chrome 原生 i18n 的少量键（不含复数/占位符），脚本就能稳定生成。

5. 校验脚本要点（思路）
   • 读取 en.ts 作为基准，深度遍历对象键；
   • 逐语言比对缺失/冗余键；
   • 用正则抓 {var} 和 $1 占位符，对齐数量与命名；
   • CI 中 npm run i18n:check 失败即拒绝合并。

⸻

你的方案里，值得肯定 & 建议微调

👍 已做对的
• 拆分 locales/<lang>.ts、集中 Messages 类型、未知语种回退——正确且可扩展。
• LANGUAGE_CONFIG 自动生成 Language 联合类型 & 可用语言清单——减少漏改。

🔧 建议微调 1. 把“区域别名/书写方向/显示名”也纳入 LANGUAGE_CONFIG（上文示例有）。2. 运行时插值统一走 ICU，避免字符串拼接。3. 回退逻辑增加“区域→基础”（如 es-MX → es-419/es）。4. 把 \_locales 的生成脚本正式加入 repo（你在“后续建议”里已提到，这一步很关键）。5. 为 service worker 单独打包瘦身版 i18n（只含 t() + 当前语言字典，避免冷启动慢）。6. 增加 Pseudo-loc 做 UI 容错（长文本、RTL 预演）。

⸻

先扩哪些语言更划算（按用户盘推荐顺序）

在你已有 zh-CN / en / ja 的基础上，建议优先：es-419（或 es-ES）→ ru → pt-BR → de → fr → ko → it → zh-TW。
对应代码：es-419, ru, pt-BR, de, fr, ko, it, zh-TW。
（这套组合与 Obsidian 社区体量基本一致，同时覆盖拉美与东亚两端。）

⸻

最后给你一份落地清单
• 增补 LANGUAGE_CONFIG：dir/aliases/label。
• 在 en.ts 上锚定 Messages，其它语言 satisfies Messages。
• 引入 ICU 运行时（或你的 factory 支持 ICU 语法）。
• 添加 resolveLang() 回退算法与 loadLocale()。
• 新建 scripts/gen-locales.ts + scripts/lint-i18n.ts，接入 CI。
• 给 manifest/title/menu 提供 static 键域，并由脚本生成 \_locales/\*/messages.json。
• chrome.storage.sync 存语言首选项；UI 提供“跟随系统/手动选择”。
• 加 qps-ploc 伪本地化与 RTL 预案。
