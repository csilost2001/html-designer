# AGENTS.md — designer-mcp (Backend)

MCP サーバ + WebSocket ブリッジ。ブラウザと AI コーディングエージェントの双方からファイル操作を受け付ける常駐サーバ。プロジェクト全般のルールは上位の [../AGENTS.md](../AGENTS.md) を参照。

## Commands

```bash
npm install
npm run dev        # Watch mode (tsx)
npm run build      # Compile to dist/
```

常駐サーバ (#302): `npm run dev` で 1 回起動すれば、ブラウザ・複数の AI エージェントセッション双方が接続できる。エージェント終了でも停止しないので、次回以降も使い回し可能。

## Key Files

- `src/tools.ts` — 20 MCP tool definitions
- `src/wsBridge.ts` — WebSocket server + broadcast

## MCP / WebSocket

- **MCP (HTTP Streamable, port 5179):** AI エージェントは MCP 設定 (Claude Code は `.mcp.json`、Codex は `.codex/config.toml`) で HTTP URL エントリ経由接続。常駐サーバなので複数エージェントセッション同時接続可、orphan 問題も解消
- **WebSocket (port 5179):** Browser reads/writes screen data — MCP と同一 port に同居
- **Shared storage:** `data/` directory (project.json + screens/*.json)

**自動 spawn はしない** (URL mode): エージェント起動時に既存サーバが無いと MCP 不接続状態になるため、backend が上がっているか先に確認すること。

## Testing

- MCP E2E: `../designer/e2e/mcp/**/*.spec.ts` — wsBridge ファイル操作（本サーバの起動が必要）
