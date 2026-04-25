# docs/spec/

本プロジェクトの UI・操作・内部 API の詳細仕様を集約する場所。

## 現在の仕様書

| ファイル | 対象 | 関連 issue |
|---|---|---|
| [list-common.md](list-common.md) | 一覧系画面の操作・見た目・内部 API (選択・キーボード・D&D・コピペ・ソート・フィルタ・Read-only モード・No 列永続フィールド) | #133 / #148 |
| [process-flow-maturity.md](process-flow-maturity.md) | 成熟度・付箋・上流/下流モード (Phase 1 基盤) | #151 / #152 |
| [process-flow-variables.md](process-flow-variables.md) | 変数・入出力・outputBinding (Phase 1 基盤) | #151 / #152 |
| [process-flow-extensions.md](process-flow-extensions.md) | HTTP 契約 / TX / Saga / 外部 outcomes / ValidationRule / compute / return (Phase B) | #151 / #182 |
| [process-flow-expression-language.md](process-flow-expression-language.md) | runIf / expression / bodyExpression の式言語 BNF (js-subset) | #253 |
| [process-flow-runtime-conventions.md](process-flow-runtime-conventions.md) | SQL 式補間 / HTTP body シリアライズ / TX×throw×tryCatch / fireAndForget / sideEffects TX 境界等の実行時規約 | #261 |
| [process-flow-testing.md](process-flow-testing.md) | 処理フローの Given-When-Then テストシナリオ (`testScenarios`) | #400 |
| [screen-items.md](screen-items.md) | 画面項目定義 (フォーム系バリデーション 3 層のうち「画面」層) — **ドラフト v0.1** | #318 |

**一次成果物**: JSON スキーマ [`schemas/process-flow.schema.json`](../../schemas/process-flow.schema.json) ([README](../../schemas/README.md))。仕様書と突合する機械可読版。

## 位置づけ

- `CLAUDE.md` (リポジトリ直下) — プロジェクト全体のアーキテクチャ・規約・コマンド
- `docs/spec/*.md` — 個別機能の詳細仕様（長い・詳細・一次情報）
- `docs/design-server-storage.md` / `docs/porting/` 等 — 設計/調査ドキュメント

仕様が分かりにくい・矛盾する・古くなっている場合は、**仕様書側を更新**してから実装。コード側のコメントやイシューに詳細を書くと必ず drift する。
