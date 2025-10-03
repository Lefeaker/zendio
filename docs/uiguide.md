
🎨 视觉基调（与 Logo 保持一致）

1) 设计变量（Design Tokens）

把颜色/圆角/阴影/间距先固化为变量，后续所有组件都用它们。

:root {
  /* 基础色 */
  --bg: #0B0C12;                  /* 背景 */
  --bg-elev-1: #111320;           /* 卡片层 */
  --bg-elev-2: #14172A;           /* 浮层/模态 */
  --border: #24273B;
  --text: #E7E8F2;
  --text-dim: #A3A8C3;

  /* 霓虹主色（与 Logo 一致） */
  --accent-start: #A855F7;        /* 紫 */
  --accent-mid:   #6366F1;        /* 靛 */
  --accent-end:   #22D3EE;        /* 青 */
  --accent-solid: #8B5CF6;        /* 紫色实色按钮 */

  /* 状态色 */
  --ok:   #34D399;
  --warn: #FBBF24;
  --err:  #F87171;

  /* 圆角与阴影 */
  --radius-lg: 14px;
  --radius-sm: 10px;
  --shadow-soft: 0 10px 30px rgba(0,0,0,.35);
  --shadow-neon: 0 0 0 1px rgba(120,90,255,.4) inset,
                 0 0 22px rgba(120,90,255,.25);
  --ring: 0 0 0 3px rgba(124,58,237,.35);
}

使用原则：深色背景 + 低饱和文字，只在关键交互处用霓虹渐变/发光。这样既“有味道”，又不浮夸。

2) 渐变与发光的使用
	•	仅用于：主按钮、卡片顶部细线、图标描边、分组标题。
	•	背景/卡片主体保持纯色 + 细边，少用大面积渐变。

⸻

🧩 组件样式（替换“AI 默认组件感”）

1) 区块容器（Card）

.card {
  background: var(--bg-elev-1);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-soft);
  padding: 18px 20px;
}
.card--title {
  display: flex; align-items: center; gap: 10px;
  font-weight: 600; color: var(--text);
  margin-bottom: 12px;
}
.card--title .label {
  background: linear-gradient(135deg,var(--accent-start),var(--accent-end));
  -webkit-background-clip: text; background-clip: text; color: transparent;
}
.card--hint { color: var(--text-dim); font-size: 12px; }

效果：每个设置分组像“模块化卡片”，顶端标题用渐变文字，与 Logo 同风格。

2) 表单（Input / Select / Toggle）

.input, .select, .textarea {
  background: var(--bg-elev-2);
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 10px;
  padding: 10px 12px;
  outline: none;
  transition: box-shadow .15s ease, border-color .15s ease;
}
.input:focus, .select:focus, .textarea:focus {
  border-color: #6D28D9;
  box-shadow: var(--ring);
}
.helper {
  color: var(--text-dim); font-size: 12px; margin-top: 6px;
}

要点：
	•	统一圆角/高度/字体；
	•	内阴影和发光只在 Focus 时出现，提升“精致感”。

Toggle（开关）
	•	推荐“细描边 + 渐变圆点”的样式，和主色一致。
	•	On: 渐变滑块 linear-gradient(135deg, var(--accent-start), var(--accent-end))；
	•	Off: 暗灰滑块；注意可访问性，要有键盘操作与 ARIA 标签。

3) 主按钮 / 次按钮

.btn-primary {
  background: linear-gradient(135deg,var(--accent-start),var(--accent-end));
  color: white; border: 0; border-radius: 12px;
  padding: 10px 14px; font-weight: 600;
  box-shadow: 0 6px 20px rgba(122,84,255,.25);
  transition: transform .12s ease, box-shadow .12s ease, filter .12s;
}
.btn-primary:hover { transform: translateY(-1px); filter: saturate(1.1); }
.btn-primary:active { transform: translateY(0); box-shadow: none; }

.btn-ghost {
  background: transparent;
  border: 1px solid var(--border);
  color: var(--text);
  border-radius: 12px; padding: 10px 14px;
}

推荐交互：设置页底部放一个吸底“保存更改”条（sticky），使用主按钮 + 次按钮（撤销）。

4) 小徽标与状态
	•	“已连接/失败”用 点状状态灯 + 文案（OK=绿、Warn=黄、Err=红）。
	•	提供一键测试连接按钮放在“Local REST API”卡片右上角。

⸻

📑 设置页布局

版式
	•	最大宽度：max-width: 960–1080px，居中；
	•	分组：语言 → Local REST API → 仓库路由 → AI → 高级 → 关于；
	•	每组是 .card；卡内使用两列网格（标签在上、输入在下），长字段独占一行。

示例结构（伪代码）

<header class="page-header">
  <img src="logo_128.png" alt="" />
  <div class="title">All in Obsidian</div>
  <div class="subtitle">配置你的剪藏插件，让内容管理更智能</div>
</header>

<section class="card">
  <div class="card--title">
    <img src="icon_lang.svg" alt="" /> <span class="label">语言设置</span>
  </div>
  <div class="grid two">
    <label>界面语言</label>
    <select class="select">...</select>
  </div>
</section>

<section class="card">
  <div class="card--title">
    <img src="icon_rest.svg" alt="" /> <span class="label">Obsidian Local REST API</span>
    <span class="status ok">● 已连接</span>
    <button class="btn-ghost small">测试连接</button>
  </div>
  <div class="grid two">
    <div>
      <label>HTTPS URL</label>
      <input class="input" placeholder="https://127.0.0.1:27124/" />
      <div class="helper">通常端口为 27124，用于安全连接</div>
    </div>
    <div>
      <label>HTTP URL</label>
      <input class="input" placeholder="http://127.0.0.1:27123/" />
      <div class="helper">作为备用连接</div>
    </div>
    <div>
      <label>Vault 名称</label>
      <input class="input" placeholder="blog" />
    </div>
    <div>
      <label>API Key</label>
      <input class="input" type="password" />
    </div>
  </div>
</section>

<footer class="savebar sticky">
  <button class="btn-ghost">撤销更改</button>
  <button class="btn-primary">保存更改</button>
</footer>

交互细节
	•	字段级帮助替换掉大块说明文字（避免“AI 说明书风”）。
	•	连接状态在标题行显示，不占据表单行。
	•	行间距统一 12–16px；卡片间距 18–22px。

⸻

✂️ 剪藏弹窗（Modal）重设计

结构
	•	标题：剪藏选中内容（副标题显示来源域名 + 图标）
	•	片段预览：单色块（深灰）承载被选文本，边上用一条极细渐变线强调
	•	评论框：简洁 textarea（支持 @tag、#topic 提示）
	•	会话控制：[✓ 添加到阅读会话]（下拉选择已有会话 / 新建）
	•	落地策略：目标文件夹 + 命名规则（如 {{date}} {{title}}）
	•	底部：取消（ghost） + 剪藏（primary）

视觉
	•	Modal 背景：var(--bg-elev-2)；
	•	顶部细分隔线使用渐变：height: 1px; background: linear-gradient(90deg, var(--accent-start), var(--accent-end));
	•	不使用强投影，改用环形发光（focus ring）表示交互区域。

动效
	•	弹窗 scale(0.98) → 1，时长 160ms，cubic-bezier(.2,.8,.2,1)
	•	按钮 hover：轻微上移 1px + 饱和度提升；
	•	输入框 focus：环形发光 var(--ring)。

⸻

♿️ 可用性与可访问性
	•	颜色对比度 ≥ 4.5:1；主要文本不要用纯灰低对比。
	•	键盘导航顺序明确，Esc 关闭弹窗，Ctrl/⌘ + Enter 快速“剪藏”。
	•	所有交互控件添加 aria-label，状态有 role="status" 的无侵入提示。

⸻

🧪 UI 打磨清单（贴墙就能照做）
	•	所有卡片统一圆角、边框、阴影
	•	所有输入统一高度与字号（14–15px），Label 在上
	•	所有标题行左有小图标 + 渐变字
	•	Sticky SaveBar
	•	连接状态徽章（● 已连接 / ● 失败）
	•	表单帮助文本用淡色小字，避免大段说明
	•	弹窗统一边距 20–24px，底部主按钮突出
	•	Hover/Focus 动效统一（速度/曲线）