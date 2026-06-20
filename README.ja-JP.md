[English](README.md) | [中文](README.zh-CN.md)

<p align="center">
  <img src="marketing/banner.png" alt="Zendio Banner" width="600"/>
</p>

## 概要

- **ワンラインピッチ**: Zendio は、Web ページ、選択フラグメント、読書セッション、動画ノート、AI チャット会話を Obsidian 向けの構造化 Markdown として保存するブラウザ拡張機能です。
- **解決する課題**:
  - Web、動画、会話の内容を手作業でコピーする負担を減らす
  - ソースリンク、注釈、タイムスタンプ、スクリーンショット、YAML メタデータをまとめて保持する
  - ルーティングルール、パステンプレート、YAML フィールドを Obsidian Bases、Dataview、[Sidebar Highlights](https://github.com/trevware/obsidian-sidebar-highlights) に合わせて調整できる
- **対象ユーザー**: 研究者、エンジニア、ライター、ナレッジワーカー、Obsidian のヘビーユーザー。

## 現在の機能

- Options と初回セットアップは現在の Stitch UI 経路に統合され、12 のリリース UI 言語に対応しています。
- Chromium ではユーザーが選択したローカル Vault フォルダへの書き込みを推奨し、REST はフォールバックおよび Firefox の書き込み経路です。
- 動画モードは YouTube と Bilibili のタイムスタンプノート、テキストフラグメント、スクリーンショット状態ドット、エクスポート時の添付画像に対応しています。
- 未保存の読書・動画ドラフトは直近 48 時間、最新 5 ページ、各ページ最大 20 件まで復元できます。
- 記事、動画、フラグメント、読書セッション、AI チャットにはそれぞれ専用のパステンプレートと YAML プレビューがあります。
- サポート、フィードバック、連絡先、更新履歴、利用規約、プライバシーポリシーは Options と初回セットアップから同じように開けます。

## 機能ハイライト

### Web クリッピング

- 選択テキストまたは記事全体を右クリックで保存。
- タイトル、URL、著者、取得時刻などのメタデータを抽出。
- Mozilla Readability で本文を整形し、チェックリスト、コードブロック、数式、表を保持。
- Text Fragment URL を生成し、元の段落へ戻りやすくします。

### フラグメントコメント

- クリッピングパネル内で注釈をその場で追加。
- コメントとソース本文を構造化 Markdown として保存。
- 同じページを繰り返し保存してもタイムスタンプ付きファイル名で上書きを防止。
- キーボード操作に配慮したフォーカス処理を備えています。

### 読書セッション

- 1 つまたは複数ページのフラグメントを読書ノートとしてまとめる。
- 読書順、ソースページ、注釈を保持。
- 保持期間内であればブラウザやタブを開き直した後も未保存ドラフトを復元。

### 動画ノート

- 対応する YouTube と Bilibili ページでタイムスタンプノートを保存。
- コメント、字幕、選択テキストをジャンプバックリンク付きで保存。
- 各タイムスタンプにスクリーンショットがあるかをドットで表示し、クリックで状態を切り替え。
- スクリーンショット添付の保存先、ファイル名、Markdown URL を個別に設定可能。
- 動画ノートは記事やフラグメントとは別の動画用パステンプレートを使用します。

### AI チャット会話の保存

- ChatGPT、Claude、Gemini、Copilot、Perplexity、通義千問、DeepSeek、Kimi などの会話をエクスポート。
- プラットフォームの UI ノイズやリアクション表示を取り除き、会話構造と書式を保持。
- 任意のメタデータ補助機能は、ユーザーが設定したプロバイダーだけを使います。基本的なクリップとエクスポートにモデルプロバイダーは不要です。

### マルチ Vault ルーティング

- 複数の Obsidian Vault ターゲットを設定。
- ドメイン、キーワード、URL、優先度、フォールバックルールで保存先を振り分け。
- Options で接続テストを実行し、診断から不足した設定フィールドを修復。

### YAML とテンプレート

- 記事、動画、フラグメント、読書セッション、AI チャットごとに保存パスを設定。
- コンテンツタイプ別の YAML フィールドとドメイン別マッピングを編集。
- YAML プレビューは現在の編集状態と選択中のコンテンツタイプから生成されます。

### ローカライズ

- リリース UI 言語: English、简体中文、繁體中文、日本語、Deutsch、Français、Español、Español latinoamericano、Italiano、한국어、Português brasileiro、Русский。
- 言語選択メニューでは各言語名をその言語の表記で表示します。

## インストールとセットアップ

1. **拡張機能をビルドまたは入手**
   - ローカル確認では `npm run build` を実行し、Chrome のデベロッパーモードで `build/dist` を読み込みます。
   - Firefox は Firefox 用のビルド/パッケージスクリプトを使い、REST 経路で Vault に書き込みます。
2. **書き込み経路を選択**
   - Chromium 推奨: Options でローカル Obsidian Vault フォルダを選択。
   - ローカルフォルダが使えない、拒否された、未対応、またはプリフライトに失敗した場合は [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) を設定。
   - Firefox は [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) で Vault に書き込みます。
3. **Options を完了**
   - Vault ターゲットとフォールバック動作を設定。
   - ルーティングルール、パステンプレート、YAML フィールド、動画スクリーンショット添付テンプレート、任意プロバイダーを設定。
   - 匿名利用統計とエラー診断のプライバシースイッチを確認。

## 開発ベースライン

- Node.js: `.nvmrc` は `20.20.2`、package engines は `>=20.19 <21`。
- npm: 検証済みバージョンは `10.8.2`、package engines は `>=10 <11`。
- `npm run test*` と `npm run visual*` は先に `verify:runtime` を実行します。
- よく使うローカルゲート:
  - `npm run quality`
  - `npm run verify:preflight`
  - `npm run verify:stitch-secondary`
  - `npm run build`

## 権限

| 権限                                      | 目的                                                                                        | プライバシー境界                          |
| ----------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------- |
| `activeTab`                               | ユーザーが保存するページ内容を読む                                                          | クリップ操作時のみ使用                    |
| `scripting`                               | クリップ、読書、動画、サポート UI のコンテンツスクリプト注入                                | 実行時コードはオープンソース              |
| `storage`                                 | 設定、ルート規則、ローカル ID、最近の復元可能ドラフトを保存                                 | ブラウザ拡張の保存領域内に保持            |
| `contextMenus`                            | 右クリック保存アクションを追加                                                              | 閲覧履歴は追跡しません                    |
| `notifications`                           | 完了または失敗通知を表示                                                                    | ローカル通知のみ                          |
| `downloads`                               | ユーザー要求時にフォールバック/エクスポートファイルを保存                                   | ユーザー操作でのみ発生                    |
| `offscreen`                               | Chromium のローカルフォルダブリッジとスクリーンショット処理                                 | 対応ブラウザのローカル操作にのみ使用      |
| `host_permissions: <all_urls>`            | ユーザーが操作するページでクリップを有効化                                                  | ユーザー起点の取得フローに限定            |
| `host_permissions: http(s)://127.0.0.1/*` | [Obsidian Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) と通信 | ローカル Obsidian REST エンドポイントのみ |

ローカルフォルダアクセスは任意で、Chromium のみ対応です。Zendio は任意のローカルパスへ書き込めません。ユーザーが明示的に選択したフォルダハンドルの範囲に限定され、Options から解除できます。

## クイックスタート

1. テキストを選択し、右クリックで Zendio の保存アクションを選ぶ。
2. 浮動パネルでコメント、タグ、保存先 Vault を追加。
3. 動画ページでは Zendio の動画パネルでタイムスタンプノートとスクリーンショット状態を追加。
4. 読書または動画セッションを終了し、Markdown ノートと添付をエクスポート。
5. Obsidian で保存されたノート、YAML メタデータ、関連アセットを確認。

## YAML 例

**Article**

```markdown
---
type: article
title: '読書ノートのタイトル'
url: 'https://example.com'
author: '著者'
clipped_at: '2026-06-20T12:00:00'
tags: [clipping]
---

本文をここに記載...
```

**Video**

```markdown
---
type: video
platform: 'Bilibili'
title: '動画ノートのタイトル'
url: 'https://www.bilibili.com/video/example'
clipped_at: '2026-06-20T12:05:00'
tags: [video]
---

## 00:42

- このタイムスタンプのメモ
- Screenshot: `./assets/video-note-0042.png`
```

**Fragment**

```markdown
---
type: fragment
source_title: '元ページのタイトル'
source_url: 'https://example.com#~:text=fragment'
comment: '自分の注釈'
clipped_at: '2026-06-20T12:10:00'
route: 'Research Vault'
---

> ページから抜粋したテキスト
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

最近の論文進捗を要約してください。

### assistant

主要なポイントは以下の通りです...
```

**Reading Session**

```markdown
---
type: reading-session
sources:
  - title: '記事 A'
    url: 'https://example.com/a'
  - title: 'フラグメント B'
    url: 'https://example.com/b#fragment'
compiled_at: '2026-06-20T14:00:00'
---

1. 第1ラウンドの読書メモ...
2. 第2ラウンドの洞察...
```

## サポートとフィードバック

- 公式サイト: [sxnian.com/projects/zendio](https://sxnian.com/projects/zendio/en/)
- Ko-fi: [ko-fi.com/xiannian](https://ko-fi.com/xiannian)
- WeChat Reward: Zendio のサポートモーダルから表示できます
- フィードバック: [GitHub Issues](https://github.com/Lefeaker/zendio/issues)、[Reddit](https://www.reddit.com/user/sxnian/)、または [email](mailto:zendio@sxnian.com)

## クレジットとライセンス

- インスピレーション: [Readwise](https://github.com/readwiseio/obsidian-readwise)、[Sidebar Highlights](https://github.com/trevware/obsidian-sidebar-highlights)、[Dataview](https://github.com/blacksmithgu/obsidian-dataview)、[Obsidian Bases](https://github.com/hadynz/obsidian-bases)
- サードパーティコンポーネント: [AI Chat Exporter](https://github.com/revivalstack/chatgpt-exporter)、[Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper)、[Mozilla Readability](https://github.com/mozilla/readability)、[Turndown](https://github.com/mixmark-io/turndown)
- ライセンス: MIT。`LICENSE` を参照してください。
- 連絡先: [website](https://sxnian.com/projects/zendio/en/)、[GitHub](https://github.com/Lefeaker/zendio)、[Reddit](https://www.reddit.com/user/sxnian/)、または [zendio@sxnian.com](mailto:zendio@sxnian.com)
