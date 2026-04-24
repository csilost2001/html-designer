# CLAUDE.md

Claude Code 向けの補足ガイダンス。

**プロジェクト全般のルールは [AGENTS.md](./AGENTS.md) を参照してください** (Codex CLI 等の他 AI コーディングエージェントも同ファイルを読みます)。以下は Claude Code 固有の事項のみ記載します。

@AGENTS.md

---

## Claude Code 固有の環境

### MCP 接続

- `.mcp.json` の URL エントリ経由で `designer-mcp` に自動接続 (port 5179)
- 起動前提: `cd designer-mcp && npm run dev` で常駐済みであること
- 接続先: `http://localhost:5179/mcp`

### Slash Commands / Skills

本プロジェクトで利用する Claude Code 固有スキル (`.claude/skills/`):

- **`/review-pr <N>`** — PR 独立レビュー (`.claude/skills/review-pr/SKILL.md`)
- **`/review-issue <N>`** — ISSUE 単位の実装網羅性監査 (`.claude/skills/review-issue/SKILL.md`)
- **`/test-strategy`** — テスト実装時の自動起動スキル (`.claude/skills/test-strategy/SKILL.md`)
- **`/rename-screen-ids`** — AI 推論による画面項目 ID 再命名 (`.claude/skills/rename-screen-ids/SKILL.md`)

Codex CLI 利用時はこれらのスキルは直接呼び出せません。等価機能は Codex plugin の `/codex:review` 等で代替するか、Opus が briefing で代替指示を出します。

### Memory システム

- 自動メモリの保存先: `C:\Users\csilo\.claude\projects\C--projects-html-designer\memory\`
- `MEMORY.md` が index、個別ファイルは `feedback_*.md` / `project_*.md` / `reference_*.md` 等の命名規約
- Codex 経由のタスクでは memory は自動共有されないため、必要な文脈は Opus が briefing に転記する

### 命名運用中の重要事項

- `ProcessFlow` → `ProcessFlow` への大規模リネームを計画中 (2026-04-25 決定)
- 詳細は memory `project_framework_research_2026_04_25.md` を参照
- リネーム完了まで当面は混在表記あり

### Codex plugin 連携 (2026-04-25 以降導入)

本プロジェクトでは **Codex plugin 経由で GPT-5.5 にタスク委譲** する運用を試行中。詳細は memory `project_framework_research_2026_04_25.md` を参照。

- 実装委譲: `/codex:rescue <task description>`
- 一次レビュー: `/codex:review`
- 挑発的レビュー: `/codex:adversarial-review`
- プロジェクト固有設定: `.codex/config.toml` を配置可能 (推奨モデル / reasoning effort 等)
