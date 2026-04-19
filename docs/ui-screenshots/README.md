# 処理フロー UI スクリーンショット

Phase B 拡張後の処理フロー機能 UI を記録したもの。`docs/spec/process-flow-extensions.md` 等の仕様書から参照される。

**撮影時点**: 2026-04-20 (Phase B スキーマ凍結・5.0/5 ドッグフード到達後)
**対象データ**: `data/actions/cccccccc-0002/0005-*.json` (顧客一覧画面 / 顧客登録画面)

## 索引

| # | ファイル | 機能 | 仕様リンク |
|---|---------|------|-----------|
| 01 | [process-flow-list](01-process-flow-list.png) | 処理フロー一覧 — maturity サマリバー + maturity フィルタ | [maturity.md](../spec/process-flow-maturity.md) |
| 02 | [dashboard](02-dashboard.png) | ダッシュボード全景 | — |
| 03 | [action-editor](03-action-editor.png) | ActionEditor 全景 — maturity/モード/進捗/アクションタブ/HTTP 契約/structured fields/ツールバー | [extensions.md §1](../spec/process-flow-extensions.md) |
| 04 | [step-expanded](04-step-expanded.png) | ステップ展開状態 — runIf / outputBinding / 代入方式 | [extensions.md §2](../spec/process-flow-extensions.md) |
| 05 | [step-card-detail](05-step-card-detail.png) | DB操作 ステップ詳細 — テーブル / 操作 / 完全 SQL | [variables.md](../spec/process-flow-variables.md) |
| 06 | [dashboard-maturity-panel](06-dashboard-maturity-panel.png) | ダッシュボード処理フロー成熟度パネル (拡大) — 確定率 + 内訳バッジ + 未確定警告 | [maturity.md](../spec/process-flow-maturity.md) |
| 07 | [notes-and-advanced-meta](07-notes-and-advanced-meta.png) | 付箋パネル + 詳細メタ情報 (TX境界/Saga/外部chain) 同時展開 | [extensions.md §2, §8](../spec/process-flow-extensions.md) |
| 08 | [external-outcomes](08-external-outcomes.png) | 外部システム outcomes — 成功 / 失敗 / タイムアウト (continue/sameAs/sideEffects) | [extensions.md §4](../spec/process-flow-extensions.md) |
| 09 | [validation-rules](09-validation-rules.png) | 構造化 ValidationRule[] + A:OK / B:NG 分岐 + responseRef / bodyExpression | [extensions.md §3](../spec/process-flow-extensions.md) |
| 10 | [compute-step](10-compute-step.png) | 計算/代入 ステップ — expression (Math.floor 例) | [extensions.md §5](../spec/process-flow-extensions.md) |
| 11 | [subtype-picker](11-subtype-picker.png) | サブステップ種別ピッカー (14 種、ループ終了 / 次のループへ / ジャンプ / 計算/代入 / レスポンス返却 を含む) | — |
| 12 | [template-dialog](12-template-dialog.png) | ステップテンプレート選択 (バリデ+エラー表示 / DB検索+結果表示 / DB登録+完了画面遷移 / 認証+権限チェック) | — |
| 13 | [downstream-mode](13-downstream-mode.png) | 下流モード — 未確定ステップ警告バナー (draft 8 / provisional 1) | [maturity.md](../spec/process-flow-maturity.md) |

## 撮影方法

Playwright MCP 経由でブラウザ自動操作。対象 URL:
- `/process-flow/list` — 一覧系
- `/process-flow/edit/cccccccc-0002-4000-8000-cccccccccccc` — 顧客一覧画面
- `/process-flow/edit/cccccccc-0005-4000-8000-cccccccccccc` — 顧客登録画面
- `/` — ダッシュボード (localStorage `dashboard-layout-v1` で `process-flow-maturity` パネルを `w:5, h:4` にリサイズ)

## 更新方針

- UI に破壊的変更があった場合は該当画像を差し替え
- 古くなった画像は仕様書からの参照が切れないよう、ファイル名を維持して中身だけ更新する
- PNG ファイルは `.gitignore` の `!docs/ui-screenshots/*.png` 例外で追跡中
