<p align="center">
  <img src="marketing/banner.png" alt="All in Ob Banner" width="600"/>
</p>

---

## 概要 | What & Why

- **ワンラインピッチ**: All in Ob はブラウザ拡張機能で、ウェブページ、ハイライト、コメント、AI チャットを構造化された Markdown ノートに保存します。
- **解決する課題**:
  - ウェブや対話の内容を手動でコピー＆ペーストする作業をなくす
  - コンテキスト、注釈、ソースリンクを保持し、洞察を失わないようにする
  - Obsidian Bases と HiNote に合わせた YAML / Properties を自動生成
- **対象ユーザー**: 研究者、エンジニア、ライター、ナレッジワーカー、Obsidian のヘビーユーザー

## 最新アップデート | Latest Enhancements

- ♿ クリッパーダイアログにフォーカストラップとスクリーンリーダーラベルを追加し、`Alt` + 矢印キーで位置を微調整可能にしました。
- 🌐 オプション画面をモジュラー構成とカスタム確認ダイアログで再構築し、日本語・中国語・英語のすべての文言を網羅しました。
- 🤖 AI チャットパーサーをモジュール化し、ChatGPT / Claude / Copilot / Gemini の安定性を保ちながら、通義千問・DeepSeek・Kimi を正式サポートしました。
- 📌 フラグメントのコンテキスト取得がネストされたリストや Shadow DOM、Text Fragment に対応し、周辺情報をまるごと保存します。
- 🔐 Obsidian REST 書き込みがリトライ強化・ログでの API キーマスク・HTTPS / HTTP 自動フォールバックに対応しました。

## 機能ハイライト | Features

### 📑 Web クリッピング
- 任意の選択範囲や記事全体を右クリックですぐ保存
- タイトル、URL、著者、取得タイムスタンプなどのメタデータを自動抽出
- Mozilla Readability で本文を整形し、チェックリスト、コードブロック、数式、表を保持
- Text Fragment URL を生成し、元の段落へワンクリックでジャンプ

### 💬 フラグメントコメント
- 浮動パネル内でその場の気づきをコメントとして追加
- コメントとソース本文を構造化した Markdown として並べて表示
- 同じページを繰り返し保存してもタイムスタンプ付きファイル名で上書きを防止
- フォーカストラップでキーボード操作に対応し、`Alt` + 矢印キーで位置を細かく調整可能

### 🤖 AI アシスト
- OpenAI、Ollama、ローカル WebLLM などのモデルでタイトル・要約・タグを生成
- ChatGPT、Claude、Gemini、Copilot、Perplexity、通義千問、DeepSeek、Kimi などのプラットフォームに対応
- モジュール化したプラットフォームパーサーがサイトごとのノイズを削除し、新規プラットフォーム追加も容易
- Claude の thinking ブロックや Copilot のリアクションバーなどのノイズを削ぎ落としつつフォーマットを保持

### 📚 読書セッション
- 複数のフラグメントを 1 つの「読書ノート」にまとめ、ページをまたいで整理
- セッションタイムラインで長文読解やリサーチの流れを可視化
- AI チャットと記事クリップを組み合わせて豊かなナレッジチェーンを構築

### 🗂️ マルチボルトスマートルーティング
- 複数の Obsidian Vault を設定し、ドメイン・キーワード・URL ルールで自動振り分け
- ルールの優先度やフォールバック、通知を調整し、すべてのクリップを最適な Vault に送る
- ローカライズされた新しいオプションビルダーで安全なプレビューと確認フローを提供し、設定ミスを防止

### 🔗 HiNote 互換性
- HiNote のワークフローに必要なフィールドを含めてハイライトをエクスポート
- YAML frontmatter は Bases、Dataview などのプラグインでそのまま利用可能

### 🌍 ローカライズとカスタマイズ
- UI は簡体字中国語・英語・日本語に対応し、即座に切り替え可能
- パステンプレート、コンテンツテンプレート、Markdown ルールを調整してあらゆるワークフローに適合

## インストールとセットアップ | Install & Setup

1. **Chrome 拡張機能をインストール**  
   現在は開発ビルドのみ提供。リポジトリをダウンロードし、Chrome のデベロッパーモードで `dist/` ディレクトリを読み込んでください。（ストアリンクは準備中）
2. **Obsidian Local REST API を設定**  
   - Obsidian に [Local REST API](https://github.com/coddingtonbear/obsidian-local-rest-api) プラグインをインストール
   - プラグインを有効化し、API キーを設定してエンドポイントを確認（デフォルトは `https://127.0.0.1:27124`）
3. **拡張機能の設定を完了**  
   - 拡張アイコンを右クリック → オプション
   - Vault パス、REST API 設定、AI API キーを入力
   - ルーティングルールとテンプレート（Article / Fragment / AI Chat / Reading Session）を定義

### 権限の内訳

| 権限 | 目的 | プライバシーの約束 |
| --- | --- | --- |
| `activeTab` | クリップ対象ページの内容を取得 | クリップ時のみ動作し、第三者へは送信しません |
| `scripting` | 浮動パネルと注釈のコンテンツスクリプトを挿入 | すべてオープンソースで検証可能 |
| `storage` | 拡張設定、ルーティングルール、保留タスクを保存 | データはブラウザにのみ保持 |
| `contextMenus` | 右クリックメニューに「Save to Obsidian」を追加 | 利用時以外に履歴を追跡しません |
| `notifications` | クリップ完了のトースト通知を表示 | 外部通信は行わず、通知は即座に消えます |
| `host_permissions: <all_urls>` | 任意のページでクリップ機能を有効化 | ユーザー操作時にのみページへアクセス |
| `host_permissions: https://127.0.0.1/*` | Obsidian Local REST API と通信 | ローカルの Obsidian インスタンスにのみ接続 |

## クイックスタートガイド | Quick Start

### スピードワークフロー

1. テキストを選択 → 右クリック → `Save to Obsidian`
2. 浮動パネルでコメントやタグ、Vault ルーティングを追加
3. 読了したら拡張パネルを開き、フラグメントをまとめて読書セッションノートを生成
4. Obsidian を開くと、メタデータと添付を含む Markdown ファイルがすでに整っています

### YAML テンプレート例

**Article 記事**
```markdown
---
type: article
title: "読書ノートのタイトル"
url: "https://example.com"
author: "著者"
clipped_at: "2024-01-01T12:00:00"
tags: [clipping]
---

本文をここに記載...
```

**Fragment フラグメント**
```markdown
---
type: fragment
source_title: "元ページのタイトル"
source_url: "https://example.com#~:text=fragment"
comment: "自分の注釈"
clipped_at: "2024-01-01T12:05:00"
route: "Research Vault"
---

> ページから抜粋したテキスト
```

**AI Chat AI チャット**
```markdown
---
type: ai-chat
platform: "ChatGPT"
model: "gpt-4o"
started_at: "2024-01-01T13:00:00"
tags: [ai, research]
---

### user
最近の進捗を要約してください。

### assistant
主要なポイントは以下の通りです...
```

**Reading Session 読書セッション**
```markdown
---
type: reading-session
sources:
  - title: "記事 A"
    url: "https://example.com/a"
  - title: "フラグメント B"
    url: "https://example.com/b#fragment"
compiled_at: "2024-01-01T14:00:00"
---

1. 第1ラウンドの読書メモ...
2. 第2ラウンドの洞察...
```

### スクリーンショットのプレースホルダー

- 浮動パネルや Bases テーブルビューなどのスクリーンショットは今後のリリースで追加予定です。

## ロードマップ

- ✅ リリース済み: Web クリッピング、フラグメント注釈、AI チャットエクスポート、読書セッション、マルチボルトルーティング、多言語 UI、アクセシブルなクリッパーダイアログ、モジュール化 AI パーサー
- 🚧 進行中: 高度なテンプレートマネージャー、対応 AI モデルの拡充、読書タイムラインの再生機能、Vault 全体の分析とバッチクリーンアップツール
- 💡 アイデア歓迎 — Issue や PR であなたのワークフローを共有してください

## サポート | Support

- [Ko-fi：Buy me a coffee](https://ko-fi.com/xiannian)
- [爱发电（Afdian）でサポート](https://afdian.com/a/LefShi)

## クレジットとライセンス | Credits

- インスピレーション: [Readwise](https://github.com/readwiseio/obsidian-readwise)、[HiNote](https://github.com/CatMuse/HiNote)、[Dataview](https://github.com/blacksmithgu/obsidian-dataview)、[Obsidian Bases](https://github.com/hadynz/obsidian-bases)
- サードパーティコンポーネント: [AI Chat Exporter](https://github.com/revivalstack/chatgpt-exporter)、[Obsidian Web Clipper](https://github.com/obsidianmd/obsidian-clipper)、[Mozilla Readability](https://github.com/mozilla/readability)、[Turndown](https://github.com/mixmark-io/turndown)
- ライセンス: MIT（`LICENSE` を参照）
- 作者: AiiinOB チーム — Issue・PR・Discussions から気軽にご連絡ください

---

ナレッジマネジメントをシンプルに。深い思考を軽やかに。🧠✨
