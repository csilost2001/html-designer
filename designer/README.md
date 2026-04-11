# 業務システム デザイナー

GrapesJS + React + Vite による業務システム向け WYSIWYG デザインツール。

## 起動方法

```bash
cd designer
npm install
npm run dev
```

ブラウザで http://localhost:5174 を開く。

## 動作環境

- Node.js 18 以上
- モダンブラウザ（Chrome / Edge 推奨）
- PC 向け（スマートフォン非対応）

---

## Windows での既知の問題

### npx が動かない / MCP が起動しない

Git Bash や PowerShell で `npx` コマンドを実行するとエラーになる場合がある。

**原因**: `winget` 等でインストールした Node.js / npm のパスが、
Git Bash のセッションに反映されていない。

**対処法**:

1. **ターミナルを再起動する**（インストール後は必須）
2. それでも解決しない場合は `node` の場所を確認:
   ```bash
   where node
   where npx
   ```
3. Git Bash に PATH が通っていない場合は `~/.bashrc` または `~/.bash_profile` に追記:
   ```bash
   export PATH="/c/Program Files/nodejs:$PATH"
   ```
4. または PowerShell / コマンドプロンプトで実行する

### GitHub CLI (`gh`) が Git Bash で見つからない

`winget install GitHub.cli` 後、Git Bash に PATH が反映されないことがある。

**対処法**: フルパスで実行する:
```bash
/c/Program\ Files/GitHub\ CLI/gh issue list
```
または新しいターミナルセッションを開く。

### Playwright MCP の起動オプション

`.mcp.json` に `--headless=false` を指定するとエラーになる。

```jsonc
// ❌ 誤り
{ "args": ["-y", "@playwright/mcp@latest", "--headless=false"] }

// ✅ 正しい（ headed モードはデフォルト、引数不要）
{ "args": ["-y", "@playwright/mcp@latest"] }
```

---

## ファイル構成

```
designer/
├── src/
│   ├── components/
│   │   ├── Designer.tsx   # メインレイアウト・パネルモード管理
│   │   ├── Topbar.tsx     # ツールバー（Undo/Redo/保存）
│   │   ├── BlocksPanel.tsx # 左パネル（ブロック一覧・検索）
│   │   └── RightPanel.tsx  # 右パネル（スタイル/属性/レイヤー）
│   ├── grapes/
│   │   └── blocks.ts      # GrapesJS ブロック定義
│   └── styles/
│       ├── app.css        # デザイナー UI スタイル（ダークテーマ）
│       └── common.css     # キャンバス内注入用（業務システム共通CSS）
├── index.html
└── .mcp.json              # Playwright MCP 設定
```

## 左パネルの表示モード

パネルヘッダーのボタンで切り替え可能。設定は localStorage に保存される。

| モード | 操作 | 動作 |
|---|---|---|
| **Pinned（固定）** | 📌アイコン（青） | 常時表示、レイアウト幅を占有 |
| **Auto-hide** | 📍アイコン（グレー） | 左端 6px 帯にホバーでスライドイン |
| **Hidden** | × ボタン | 完全非表示、トップバーから復帰 |

## デザインの保存

- localStorage に自動保存（キー: `gjs-designer-project`）
- 「今すぐ保存」ボタンで即時保存
- ブラウザのキャッシュをクリアするとデザインが消えるため注意

## HTML 出力

「HTMLを出力」ボタン（今後追加予定）でクリップボードにコピー。
Bootstrap 5 + common.css を参照する完全な HTML が得られる。
