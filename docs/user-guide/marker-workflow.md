# AI マーカーと `/designer-work`

designer 画面に残した指示・質問・TODO・チャットを Claude Code が読み取り、処理フローを自動編集する仕組みです。

## 4 種類のマーカー (kind)

| kind | 色 | 用途 | AI の対応 |
|------|---|------|---------|
| `todo` | 緑 | 作業指示 (命令形) | 構造的に編集して resolve |
| `question` | 紫 | 質問 (疑問形) | chat 返信 marker を追加して resolve |
| `attention` | オレンジ | 注意喚起・レビュー依頼 | **編集せず** 提案を resolution に書いて resolve |
| `chat` | 青 | 雑談・確認 | chat 返信 marker を追加して resolve |

## マーカー追加の 4 経路

### (A) MarkerPanel で直接追加

ActionEditor を開くと上部に「AI へのマーカー」パネル。kind を選んで body を入力。

### (B) 警告から 1-click 起票

画面右上「N 警告」バッジをクリック → 詳細パネルの各行「AI に依頼」ボタン。validator コード (UNKNOWN_RESPONSE_REF 等) + path 付きで kind=todo が自動起票される。

### (C) step card の 3-dots メニュー

対象 step の右上「...」→「AI に指摘」→ prompt で body 入力。stepId が自動で紐付く。

### (D) 外部ツール / API

MCP tool `designer__add_marker` を Claude Code や外部スクリプトから呼ぶ。`author: "ai"` で AI 側からの返信にも使う。

## スクショ例

- [22-warning-to-marker.png](../ui-screenshots/22-warning-to-marker.png) — 警告からの 1-click 起票
- [24-step-marker-badge.png](../ui-screenshots/24-step-marker-badge.png) — step card 上のバッジ

## `/designer-work` の実行

### 基本

新しい Claude Code 窓 (本プロジェクト内で `claude` 起動) で:

```
/designer-work <actionGroupId>
```

例: `/designer-work cccccccc-0005-4000-8000-cccccccccccc`

### 動作

Claude Code は内部で以下を順次実行:

1. `designer__list_markers(actionGroupId, unresolvedOnly=true)` で未解決 marker を取得
2. 各 marker を kind 別に処理:
   - `todo` + 命令形 + 範囲明示 → MCP tool で編集 + `designer__resolve_marker`
   - `question` / `chat` → `designer__add_marker(kind="chat", author="ai", body=回答)` + 元を resolve
   - `attention` → 編集せず resolution に提案を書いて resolve
3. **参照整合性チェック**: 新しい responseRef / tableId / typeRef / systemRef / @secret / @conv を追加する前に対象が存在するか確認。未定義なら別 attention を起票
4. **committed 保護**: ActionGroup / action / step が committed の場合、body が命令形 + 範囲明示でない限り編集しない

### リアルタイム観察

開いているブラウザは wsBridge broadcast で自動更新される。人間は画面を見ながら結果を確認し、追加 marker を書いて次の往復へ。

### サンプル実行結果

[20-dogfood-before.png](../ui-screenshots/20-dogfood-before.png) / [21-dogfood-after.png](../ui-screenshots/21-dogfood-after.png) — 4 marker 投入 → /designer-work (シミュレータ) → AI 返信 2 + errorCatalog 追加 + 4 resolve。

## 事前準備 (初回のみ)

### `.mcp.json` を確認

本プロジェクトには `.mcp.json` に `designer-mcp` が登録済み。Claude Code を本ディレクトリで起動すると自動 spawn される。

```json
{
  "mcpServers": {
    "designer-mcp": {
      "command": "npx",
      "args": ["tsx", "designer-mcp/src/index.ts"]
    }
  }
}
```

### ポート 5179 の扱い

designer-mcp は WebSocket を port 5179 で listen する。他の designer-mcp インスタンス (dev server 経由で起動したもの等) が先に掴んでいる場合、新インスタンスが起動時に古い方の終了を待つ。明示的に killしたい場合:

```bash
netstat -ano | grep :5179  # PID 取得
taskkill /F /PID <PID>     # Windows
# kill -9 <PID>            # macOS/Linux
```

## トラブル例

### 「designer-mcp が起動しない」

- `.mcp.json` が正しく読まれているか (`claude` を本プロジェクト内で起動したか)
- `designer-mcp` の依存がインストール済みか (`cd designer-mcp && npm install`)
- ポート 5179 が別プロセスで専有されていないか

### 「marker 起票したのにブラウザに反映されない」

- ブラウザが wsBridge に接続できているか (DevTools Console で `mcpBridge` のログ確認)
- designer-mcp が古いプロセスのままで、新しい Claude Code 窓の tool 呼出を聞いていない可能性 → designer-mcp 再起動

### 「/designer-work が committed ステップを一切触らない」

仕様通り。committed は AI の独断編集を保護。編集させたい場合:
- kind を `todo` にする (attention では編集されない)
- body を命令形に (「〜を追加して」「〜を削除して」)
- 対象 step / field を明示

詳細は `.claude/commands/designer-work.md` 参照。
