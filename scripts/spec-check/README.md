# scripts/spec-check/

`docs/spec/conversion-guideline-for-ai.md` の cheatsheet / 列挙系 content を `schemas/v3/` から **機械抽出** で再生成するためのスクリプト群。spec 編集者の記憶ベース更新で drift するのを防ぐ。

## 使い方

```bash
# Step kind variant-specific required 抽出 (cheatsheet 上段)
node scripts/spec-check/extract-step-required.mjs

# Nested object required 抽出 (cheatsheet 下段 + Step base 共通 field)
node scripts/spec-check/extract-nested-required.mjs

# Generic Definition Catalog (RFC 将来案) の soft lint
node scripts/spec-check/lint-generic-definitions.mjs <project-dir>
```

## 各 script

| script | 入力 | 出力 | 用途 |
|---|---|---|---|
| `extract-step-required.mjs` | `schemas/v3/process-flow.v3.schema.json` | step kind ごとの required 表 (stdout) | conversion-guideline-for-ai.md §3.3 cheatsheet 上段の機械生成 |
| `extract-nested-required.mjs` | 同上 | nested $defs (Branch / WorkflowApprover / AiMessage / CdcDestination / OutputBinding / TxBoundary 等) の required 表 | cheatsheet 下段 |
| `lint-generic-definitions.mjs` | `<project>/<dataDir>/generic-definitions/<kind>/*.json` | 各 file の必須 field 不足 warning | RFC 将来案 entity の soft validation (AJV 対象外、本 PR で導入の保険) |

## 運用

- spec の cheatsheet を更新する前に必ずこれらを run、出力を貼る
- schema 更新時 (新 step kind 追加 / required 変更) は cheatsheet 再生成を CI 化検討
- spec の §3.3 cheatsheet 末尾と §9.5 Pre-submit checklist Step 3 から本 dir を参照
