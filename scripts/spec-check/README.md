# scripts/spec-check/

`docs/spec/conversion-guideline-for-ai.md` の cheatsheet / 列挙系 content を `schemas/v3/` から **機械抽出** で再生成するためのスクリプト群。spec 編集者の記憶ベース更新で drift するのを防ぐ。

## 使い方

```bash
# 一括 CI gate (test.mjs + test-binding-grammar.mjs を両方実行)
npm run test:spec-check

# 個別 — Step kind variant-specific required 抽出 (cheatsheet 上段)
node scripts/spec-check/extract-step-required.mjs

# 個別 — Nested object required 抽出 (cheatsheet 下段 + Step base 共通 field)
node scripts/spec-check/extract-nested-required.mjs

# 個別 — Generic Definition Catalog の soft lint (path ↔ kind 物理配置、CLI 実行可)
# strict 検証 (AJV) は test.mjs § 3b 経由で `npm run test:spec-check` 内で走る
node scripts/spec-check/lint-generic-definitions.mjs <project-dir>
```

## 各 script

| script | 入力 | 出力 | 用途 |
|---|---|---|---|
| `extract-step-required.mjs` | `schemas/v3/process-flow.v3.schema.json` | step kind ごとの required 表 (stdout) | conversion-guideline-for-ai.md §3.3 cheatsheet 上段の機械生成 |
| `extract-nested-required.mjs` | 同上 | nested $defs (Branch / WorkflowApprover / AiMessage / CdcDestination / OutputBinding / TxBoundary 等) の required 表 | cheatsheet 下段 |
| `lint-generic-definitions.mjs` | `<project>/<dataDir>/generic-definitions/<kind>/*.json` | 各 file の必須 field 不足 / path-kind 不一致 warning | 親 schema (#1063) と併用、物理配置 (path ↔ kind 一致) を担当する CLI gate。AJV strict 検証は `test.mjs` § 3b |
| `lib/spec-doc.mjs` | `docs/spec/conversion-guideline-for-ai.md` | jsonc/ts fence + cheatsheet 行抽出 helper | `test.mjs` 内で spec doc 本体を gate input にするための共有 module |
| `test.mjs` | 上記すべて + spec doc + schemas/v3/ | assertion 結果 (stdout) | `npm run test:spec-check` の本体。schema → extract → spec doc の drift を gate |
| `test-binding-grammar.mjs` | binding grammar v1 parser | assertion 結果 | parser の reference 実装 + 14 ケース pass 確認 |

## 運用

- spec の cheatsheet を更新する前に必ずこれらを run、出力を貼る
- `npm run test:spec-check` が package.json scripts に組み込まれており、schema 更新時 / cheatsheet 更新時 / spec doc 更新時に必ず実行する (Round 11 review M-1〜M-3 対応で spec doc 本体も test input に組み込み済 — jsonc fence parse / ✅ JSON 例の AJV / cheatsheet drift / profile §7.3 enumeration drift をまとめて gate)
- spec の §3.3 cheatsheet 末尾と §9.5 Pre-submit checklist Step 3 から本 dir を参照
