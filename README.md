[中文](README.zh-CN.md) | [日本語](README.ja-JP.md)

<p align="center">
  <img src="marketing/banner.png" alt="Zendio Banner" width="600"/>
</p>

## Get Zendio

[Website](https://zendio.sxnian.com/en/) · [GitHub Releases](https://github.com/Lefeaker/zendio/releases) · [Report an issue](https://github.com/Lefeaker/zendio/issues)

| Browser         | Store                                                                                                                              | Availability      |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Google Chrome   | [Install from Chrome Web Store](https://chromewebstore.google.com/detail/eoohmbhdepgknfemajanfaejmonckgmo)                         | v0.3.1 available. |
| Mozilla Firefox | [Install from Firefox Add-ons](https://addons.mozilla.org/firefox/addon/zendio/)                                                   | v0.3.1 available. |
| Microsoft Edge  | [Microsoft Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/zendioall-in-obsidian/oogaldhpamhgeeloehndhcgjkijkbocm) | v0.3.1 available. |

Store status checked on **September 13, 2026**. Each store reviews releases independently; the version offered by the store may differ from the current source version, **v0.3.2**.

## What's New in v0.3.2

- Show selected text, the count and page highlights promptly when entering reading mode.
- Fix highlights remaining or reappearing after cancelling reading mode during startup.
- Fix Configure vault links in clipping, reading and video panels to open the vault settings directly.
- Add first-use tips for resizing reading and video panels and opening settings from the icon.
- Keep save targets on one line; truncate long paths or names and show the full text on hover.
- Fix missing reports when anonymous usage statistics are enabled, while preserving privacy choices.

## Introduction

- **One-line pitch**: Zendio is a browser extension for saving web pages, selected fragments, reading sessions, video notes, and AI chat conversations as structured Markdown for Obsidian.
- **What it solves**:
  - Reduces manual copy and paste across pages, videos, and conversations
  - Keeps source links, annotations, timestamps, screenshots, and YAML metadata together
  - Provides route rules, path templates, and YAML fields that fit Obsidian Bases, Dataview, and [Sidebar Highlights](https://github.com/trevware/obsidian-sidebar-highlights)
- **Who it is for**: researchers, engineers, writers, knowledge workers, and heavy Obsidian users.

## Current Capabilities

- Settings and first-run setup support 12 languages, light/dark/system themes, and responsive controls.
- Chrome and Edge can save directly to a folder you select. A local folder alone is a valid vault target; no REST URL or API key is required. Firefox uses the Obsidian Local REST API for direct vault writes.
- Markdown downloads are available when you do not want to connect a vault.
- Video mode supports YouTube and Bilibili timestamp notes, captured text fragments, screenshot status dots, and screenshot attachments on export.
- Recent unsaved reader and video drafts can be restored for the latest 48 hours, up to the latest 5 pages and 20 recoverable items per page.
- Article, video, fragment, reading-session, and AI-chat notes each have dedicated path templates and YAML preview behavior.
- Support, feedback, contact, changelog, Terms of Use, and Privacy Policy resources are available from Options and first-run setup.

## Feature Highlights

### Web Clipping

- Right-click to save any selection or full article.
- Extract title, URL, author, capture timestamp, and other metadata.
- Clean article body with Mozilla Readability while keeping checklists, code blocks, math, and tables.
- Generate Text Fragment URLs for one-click jumps back to the original paragraph.

### Fragment Comments

- Add annotations in the floating clipping panel while context is still visible.
- Save comments alongside the source text in structured Markdown.
- Timestamp-driven filenames prevent repeated clips from overwriting each other.
- Keyboard-friendly focus handling keeps the dialog usable without a mouse.

### Reading Sessions

- Merge fragments from one or more pages into a single reading note.
- Preserve reading order, source pages, and annotations.
- Restore recent unsaved reader drafts when the browser or tab is reopened within the retention window.

### Video Notes

- Capture timestamp notes from supported YouTube and Bilibili pages.
- Save comment, subtitle, or selected text fragments with jump-back links.
- Track whether each timestamp already has a screenshot; clicking the dot toggles the screenshot state.
- Export screenshot attachments with configurable location, filename, and Markdown URL templates.
- Use a dedicated video note path template, separate from article and fragment templates.

### AI Chat Conversation Capture

- Export conversations from ChatGPT, Claude, Gemini, Copilot, Perplexity, Tongyi Qianwen, DeepSeek, Kimi, and similar supported platforms.
- Remove platform chrome and reaction noise while preserving conversation structure and formatting.
- Optional metadata helpers use only the providers you configure; clipping and export do not require a model provider.

### Multi-Vault Routing

- Configure multiple Obsidian vault targets.
- Route content by domain, keyword, URL, priority, and fallback rules.
- Test connections from Options and repair missing configuration fields through diagnostics.

### YAML And Template Control

- Customize note paths for article, video, fragment, reading-session, and AI-chat exports.
- Configure YAML fields by content type, including domain-specific mapping rules.
- Preview YAML from the current editor state and selected content type.

### Localization

- Release UI languages: English, Simplified Chinese, Traditional Chinese, Japanese, German, French, Spanish (Spain), Spanish (Latin America), Italian, Korean, Portuguese (Brazil), and Russian.
- Language names are displayed in their native form in the language selector.

## Install And Setup

1. **Install from a store** using the links above, then open Zendio's Options page.
2. **Choose where to save**:
   - **Chrome / Edge — local folder:** select your Obsidian vault folder and grant access. Leave the REST URL and API key empty if you only use this folder.
   - **Obsidian Local REST API:** configure the endpoint and API key from the [Obsidian plugin](https://github.com/coddingtonbear/obsidian-local-rest-api). This is the direct vault-writing path on Firefox and an alternative on Chrome / Edge.
   - **Download:** save Markdown without connecting Obsidian or a vault.
3. **Make it yours**: choose your language and theme, then configure vault routing, note paths, YAML fields, screenshot attachments and optional providers. Review the optional usage-statistics and error-diagnostics switches.

For manual installation, use the browser-specific package attached to a published [GitHub Release](https://github.com/Lefeaker/zendio/releases). Extract a Chrome or Edge ZIP and load its folder from `chrome://extensions` or `edge://extensions` with Developer mode enabled. Firefox requires a signed XPI; its store page is the recommended installation route. GitHub's automatically generated **Source code** archives are not installable extension packages.

To build from source, follow the pinned environment and bounded commands in [the engineering guide](docs/engineering-entrypoints.md), including its [Edge instructions](docs/engineering-entrypoints.md#microsoft-edge-distribution).

## Development Baseline

- Current documentation status and maintenance rules live in [docs/document-status-governance.md](docs/document-status-governance.md).
- Node.js: `.nvmrc` pins `20.20.2`; package engines allow `>=20.19 <21`.
- npm: validated with `10.8.2`; package engines allow `>=10 <11`.
- `npm run test*` and `npm run visual*` entrypoints run `verify:runtime` first.
- Local bundled-Chromium acceptance uses the fixed two-leaf `node scripts/run-browser-test-shards.mjs bundled` route, `playwright.bundled-chromium.config.ts`, the repository-local Playwright CLI and an already-provisioned cache. The coordinator owns a fresh fixed-dist build and keeps the shared Playwright build lease through both leaves; it does not replace CI visual routes or use a system-browser fallback.
- Common local gates:
  - `npm run quality`
  - `npm run verify:preflight`
  - `npm run verify:stitch-secondary`
  - `npm run build`
- The common quality/CI path now hard-gates current UI production ownership, the canonical CSS selector scope, built content CSS packs, design-token alignment, performance hotspots, dynamic active-document governance, and the complete Git-visible GitHub Actions executable supply chain. External actions are accepted only at the reviewed full commit recorded in `scripts/config/githubActionPins.mjs` with its same-line `# vN` review alias; recursive local actions remain repository-owned composites. See [docs/engineering-entrypoints.md](docs/engineering-entrypoints.md) for the maintained entrypoints instead of duplicating their command grammar here.
- Firefox AMO automation lives in `.github/workflows/release-firefox-amo.yml`. Its credential-free prepare job binds the exact release SHA, CI provenance and immutable artifact, then runs repository static checks plus a pinned geckodriver `0.37.1` WebDriver BiDi exact-XPI smoke. The protected submit job is the only credentialed mutation boundary and uses the first-party AMO API v5 adapter for listed/unlisted submission, upload validation, source upload and signed-XPI retrieval.

## Permissions

| Permission                                | Purpose                                                                                      | Privacy boundary                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `activeTab`                               | Read the page content you choose to clip                                                     | Used only when you trigger a clip                       |
| `scripting`                               | Inject content scripts for clipping, reading, video, and support surfaces                    | Open-source runtime code                                |
| `storage`                                 | Persist settings, route rules, local IDs, and recent recoverable drafts                      | Stored in the browser extension environment             |
| `contextMenus`                            | Add the right-click save action                                                              | No browsing history tracking                            |
| `notifications`                           | Show completion and failure notifications                                                    | User-visible local notifications                        |
| `downloads`                               | Save generated fallback/export artifacts when requested                                      | User-triggered only                                     |
| `offscreen`                               | Host the Chromium local-folder bridge and screenshot processing support                      | Used only for browser-supported local operations        |
| `host_permissions: <all_urls>`            | Allow clipping on pages you actively use                                                     | Page access is tied to user-triggered capture flows     |
| `host_permissions: http(s)://127.0.0.1/*` | Talk to [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) | Communicates with the local Obsidian REST endpoint only |

Local folder access is optional and Chromium-only. Zendio cannot write to arbitrary local paths: you must explicitly choose a folder, writes are scoped to that browser-granted handle, and the handle can be cleared from Options.

## Quick Start

1. Select text, right-click, and choose the Zendio save action.
2. Add comments, tags, or a target vault in the floating panel.
3. For videos, use the Zendio video panel to add timestamp notes and screenshot states.
4. Finish a reading or video session to export the Markdown note and attachments.
5. Open Obsidian and review the saved note, YAML metadata, and linked assets.

## YAML Examples

**Article**

```markdown
---
type: article
title: 'Reading Note Title'
url: 'https://example.com'
author: 'Author'
clipped_at: '2026-06-20T12:00:00'
tags: [clipping]
---

Article body goes here...
```

**Video**

```markdown
---
type: video
platform: 'Bilibili'
title: 'Video Note Title'
url: 'https://www.bilibili.com/video/example'
clipped_at: '2026-06-20T12:05:00'
tags: [video]
---

## 00:42

- Note for this timestamp
- Screenshot: `./assets/video-note-0042.png`
```

**Fragment**

```markdown
---
type: fragment
source_title: 'Original Page Title'
source_url: 'https://example.com#~:text=fragment'
comment: 'My annotation'
clipped_at: '2026-06-20T12:10:00'
route: 'Research Vault'
---

> Highlighted text from the page
```

**AI Chat**

```markdown
---
type: ai-chat
platform: 'ChatGPT'
started_at: '2026-06-20T13:00:00'
tags: [conversation, research]
---

### user

Please summarise recent progress on the paper.

### assistant

Here are the key points...
```

**Reading Session**

```markdown
---
type: reading-session
sources:
  - title: 'Article A'
    url: 'https://example.com/a'
  - title: 'Fragment B'
    url: 'https://example.com/b#fragment'
compiled_at: '2026-06-20T14:00:00'
---

1. First reading pass...
2. Second insight...
```

## Support And Feedback

- Official website: [zendio.sxnian.com/en](https://zendio.sxnian.com/en/)
- Ko-fi: [ko-fi.com/xiannian](https://ko-fi.com/xiannian)
- WeChat Reward: available from the Zendio Support modal
- Feedback: [GitHub Issues](https://github.com/Lefeaker/zendio/issues), [Reddit](https://www.reddit.com/user/sxnian/), or [email](mailto:zendio@sxnian.com)

## Credits And License

- Inspiration: [Readwise](https://github.com/readwiseio/obsidian-readwise), [Sidebar Highlights](https://github.com/trevware/obsidian-sidebar-highlights), [Dataview](https://github.com/blacksmithgu/obsidian-dataview), [Obsidian Bases](https://github.com/hadynz/obsidian-bases)
- Third-party components: [AI Chat Exporter](https://github.com/revivalstack/chatgpt-exporter), [Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper), [Mozilla Readability](https://github.com/mozilla/readability), [Turndown](https://github.com/mixmark-io/turndown)
- License: MIT. See `LICENSE`.
- Contact: [website](https://zendio.sxnian.com/en/), [GitHub](https://github.com/Lefeaker/zendio), [Reddit](https://www.reddit.com/user/sxnian/), or [zendio@sxnian.com](mailto:zendio@sxnian.com)
