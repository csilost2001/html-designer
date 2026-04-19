# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

業務システム デザイナー — Japanese business application WYSIWYG screen designer. Two main components:

- **designer/** — Frontend (React + Vite + GrapesJS + ReactFlow)
- **designer-mcp/** — MCP server + WebSocket bridge for file persistence

## Commands

### Designer (Frontend)

```bash
cd designer
npm install        # Install dependencies
npm run dev        # Dev server (http://localhost:5173)
npm run build      # TypeScript check + Vite build
npm run lint       # ESLint
```

### Designer-MCP (Backend)

```bash
cd designer-mcp
npm install
npm run dev        # Watch mode (tsx)
npm run build      # Compile to dist/
```

Both servers must run simultaneously for file-based persistence. Without designer-mcp, the frontend falls back to localStorage.

### Test Data

```bash
node docs/sample-project/seed.mjs   # Generate 10 sample screens into data/
```

## Architecture

### Two-Process Design

```
Claude Code ──(stdio)──→ designer-mcp ←──(ws://0.0.0.0:5179)──→ Browser
                              ↕
                         data/ folder
```

- **MCP (stdio):** Claude Code sends commands (add screen, set components, etc.)
- **WebSocket (port 5179):** Browser reads/writes screen data via wsBridge
- **Shared storage:** Both access `data/` directory (project.json + screens/*.json)

### Routing

URL 規約: **`/category/feature[/:id]`** 形式（Java 風階層）。ルートは単一概念で意味が通るよう、複数解釈できる複数形は避ける（例: `/flow` は 画面フロー／処理フロー どちらか不明なため不採用）。

| Path | Component | Purpose | Opens as tab? |
|------|-----------|---------|---------------|
| `/` | DashboardView | 全体俯瞰ダッシュボード | ✅ singleton |
| `/screen/flow` | FlowEditor | 画面フロー図（ReactFlow、キャンバス固定）| ✅ singleton |
| `/screen/list` | ScreenListView | 画面一覧（カード ⇔ 表切替）| ✅ singleton |
| `/screen/design/:screenId` | Designer | 画面デザイナー（GrapesJS）| ✅ per-resource |
| `/table/list` | TableListView | テーブル一覧 | ✅ singleton |
| `/table/edit/:tableId` | TableEditor | テーブル編集 | ✅ per-resource |
| `/table/er` | ErDiagram | ER 図 | ✅ singleton |
| `/process-flow/list` | ActionListView | 処理フロー一覧 | ✅ singleton |
| `/process-flow/edit/:actionGroupId` | ActionEditor | 処理フロー編集 | ✅ per-resource |

### Tab policy

**HeaderMenu から到達できる画面と、個別リソース編集画面は、すべてタブ。**

| 種別 | 対象 | 性質 |
|------|------|------|
| シングルトンタブ | Dashboard / 画面フロー / 画面一覧 / テーブル一覧 / ER 図 / 処理フロー一覧 | 1 インスタンス固定、再オープン時は既存を再利用 |
| マルチインスタンスタブ | Designer / TableEditor / ActionEditor | リソース ID 毎に独立タブ |
| route only | なし | — |

**理由**: 一覧画面は全機能の俯瞰・順序変更・検索・帳票出力等の中心機能で、**詳細より頻繁に開かれる**。タブ化しないと毎回 HeaderMenu から辿り直しで UX 劣化する。VS Code も Welcome / Settings / Source Control などシングルトンをタブで開く。

**旧ポリシー（#98）は撤回**: 「一覧は通過点だから route only」という判断は、実際の使用頻度と衝突するため破棄。

### Key Directories

- `designer/src/components/flow/` — Flow diagram editor (ReactFlow-based)
- `designer/src/grapes/blocks.ts` — 60+ pre-built block definitions
- `designer/src/store/` — Persistence layer (flowStore, customBlockStore)
- `designer/src/mcp/mcpBridge.ts` — Browser-side WebSocket client
- `designer-mcp/src/tools.ts` — 20 MCP tool definitions
- `designer-mcp/src/wsBridge.ts` — WebSocket server + broadcast

### Data Flow

- **Save:** GrapesJS autosave → remoteStorage → mcpBridge (WS) → wsBridge → `data/screens/{id}.json`
- **Fallback:** If WS disconnected → localStorage (`gjs-screen-{id}`)
- **Sync:** wsBridge broadcasts changes to all connected browser tabs

## Environment Notes

- **Windows:** `npx` may fail in Git Bash. Ensure Node.js is in PATH.
- **gh CLI:** Added to PATH via `~/.bashrc`. No prefix needed — `gh` commands work directly.
- **Ports:** Vite on 5173 (strictPort), WebSocket on 5179. Both listen on 0.0.0.0.
- **HTTP access:** `crypto.randomUUID()` is unavailable in non-secure contexts. Use `generateUUID()` from `src/utils/uuid.ts` instead.
- **Playwright MCP:** Do not use `--headless=false` flag on Windows.

## Testing Strategy

詳細は `/test-strategy` スキル参照（テスト実装・修正時に自動起動）。

- Vitest: `designer/src/**/*.test.ts` — ストアロジック・ユーティリティ
- Playwright: `designer/e2e/**/*.spec.ts` — UI・ナビゲーション操作
- MCP E2E: `designer/e2e/mcp/**/*.spec.ts` — wsBridge ファイル操作（要 designer-mcp 起動）

## UI Conventions

詳細仕様は [docs/spec/](docs/spec/README.md) に集約。一覧系 UI を触る前に必ず読む:

- **一覧系 UI** (選択・キーボード・D&D・コピペ・ソート・フィルタ・Read-only モード・No 列永続フィールド): [docs/spec/list-common.md](docs/spec/list-common.md)
  - `DataList` / `useListSelection` / `useListKeyboard` / `useListClipboard` / `useListFilter` / `useListSort` / `<FilterBar>` / `<SortBar>` / `<ViewModeToggle>`
  - 対象画面: 画面一覧・テーブル一覧・処理フロー一覧・テーブル定義 > カラム一覧

## Conventions

- All UI text is in Japanese
- Commit messages use conventional commits in Japanese (e.g., `feat(flow):`, `fix(designer):`, `improve:`)
- **Workflow: one issue = one branch = one PR.** Never commit directly to `main`. Branch naming: `feat/issue-<N>-<slug>` for features, `fix/issue-<N>` or `fix/<slug>` for bug fixes, `docs/<slug>` for documentation-only changes. Create the branch from `origin/main` before starting work.
- PRs are squash-merged into `main`. The PR title should include the issue number (e.g., `feat(ui): ... (#83)`) so the merge commit references it.
- `data/` directory is gitignored — runtime data only
- Themes: standard (default Bootstrap), card, compact, dark — CSS injected into GrapesJS canvas iframe
- Custom blocks persist to `data/custom-blocks.json` via customBlockStore
