# designer-mcp

GrapesJSデザイナーをClaude CodeからMCP経由で直接操作するためのMCPサーバー。

## アーキテクチャ

```
Claude Code (MCP client) ←stdio→ designer-mcp-server ←WebSocket:5179→ Browser Designer
```

## MCPツール

| ツール名 | 説明 |
|---|---|
| `designer__get_html` | 現在のキャンバスのHTMLとCSSを取得 |
| `designer__set_components` | キャンバスのコンテンツをHTMLで置換 |
| `designer__screenshot` | キャンバスのスクリーンショット(PNG)を取得 |

## セットアップ

### 1. ビルド

```bash
cd designer-mcp
npm install
npm run build
```

### 2. Claude Code MCP設定

`~/.claude/settings.json` の `mcpServers` に以下を追加（自動登録済みの場合は不要）:

```json
{
  "mcpServers": {
    "designer": {
      "command": "node",
      "args": ["c:/Workspaces/HTMLデザイン/designer-mcp/dist/index.js"]
    }
  }
}
```

### 3. Claude Codeを再起動

VSCode拡張機能の場合: コマンドパレット → `Claude: Restart` または拡張機能を無効→有効にする。

## 使い方

1. デザイナーを起動: `cd designer && npm run dev` → http://localhost:5173 を開く
2. Claude Codeのトップバーにある「MCP接続中」（緑）インジケーターを確認
3. Claude Codeで自然言語でデザインを操作

### 使用例

```
「現在のキャンバスのHTMLを取得して」
→ designer__get_html が呼ばれてHTML/CSSが返る

「シンプルなログインフォームに置き換えて」
→ designer__set_components でデザイナーが更新される

「現在の画面をスクリーンショットして」
→ designer__screenshot で画像が返る
```

## トラブルシューティング

### インジケーターがグレーのまま
- MCPサーバーが起動していない可能性: Claude Codeを再起動してください
- WebSocket 5179番ポートが使用中の場合: `netstat -ano | findstr 5179` で確認

### 「デザイナーが開かれていません」エラー
- http://localhost:5173 をブラウザで開いてください
- ブラウザのDevToolsコンソールでエラーを確認してください

### ビルドエラー
```bash
npm run build
# TypeScriptエラーが出た場合はtsconfig.jsonを確認
```
