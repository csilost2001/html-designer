# JSON Schema (一次成果物) — バージョン管理

このディレクトリは、html-designer の JSON 資産の**正規スキーマ**をバージョン別に保持する。

## ディレクトリ構成

```
schemas/
├── v1/                                   ← v1 凍結スナップショット (修正不可)
│   ├── process-flow.schema.json
│   ├── conventions.schema.json
│   ├── extensions-*.schema.json (5)
│   └── README.md
├── v2/                                   ← v2 (現行、再設計版)
│   ├── common.v2.schema.json             ← 共通 $defs (全 v2 schema が参照)
│   ├── process-flow.v2.schema.json
│   ├── conventions.v2.schema.json
│   ├── extensions-*.v2.schema.json
│   ├── screen.v2.schema.json
│   ├── table.v2.schema.json
│   ├── screen-item.v2.schema.json
│   ├── project.v2.schema.json
│   ├── er-layout.v2.schema.json
│   ├── custom-block.v2.schema.json
│   ├── sequence.v2.schema.json
│   ├── view.v2.schema.json
│   └── README.md
└── README.md (本ファイル)
```

## バージョン管理ポリシー

### 凍結ポリシー

各バージョンディレクトリ (`v1/`, `v2/` ...) は**マージ後は修正不可**。バグ修正・機能追加は新バージョンを作成する。

理由:
- 既存案件が特定バージョンを参照している場合、後から変更すると validation 結果が変わる
- 業務データの schema 互換性を厳密に追跡する

例外: 起草中 (PR がまだ open) のバージョンは PR 内で改変可。マージ後は凍結。

### 新バージョンの作成

破壊的変更が必要になったら新バージョンディレクトリを作る:

```
schemas/v3/
├── common.v3.schema.json
├── process-flow.v3.schema.json
└── ...
```

非破壊的な追加 (optional フィールド追加 / additive enum) は同バージョン内で行う。

### バージョン選択 (将来実装、現状はハードコード)

`data/project.json` に `schemaVersion` プロパティを記述することで、その案件が使う schema バージョンを宣言できる:

```json
{
  "version": 1,
  "schemaVersion": "v2",
  "name": "顧客管理システム",
  ...
}
```

loader (designer / designer-mcp / vitest) は本プロパティを読んで `schemas/v<N>/` を選択する想定。**現状は v2 をハードコードで参照**。複数バージョン切替の実装は将来 ISSUE で対応。

### `$id` 規約

各 schema の `$id` はバージョン込みで宣言する:

- v1: `https://raw.githubusercontent.com/csilost2001/html-designer/main/schemas/v1/<name>.schema.json`
- v2: `https://raw.githubusercontent.com/csilost2001/html-designer/main/schemas/v2/<name>.v2.schema.json`

外部 AI / CI は特定バージョンに固定して参照する。

### 案件・業界の併存ポリシー

将来、複数の案件 / 業界 (retail / finance / manufacturing 等) が異なる schema バージョンを使うことを許容する:

- 案件 A: `schemaVersion: "v1"` で運用継続
- 案件 B: `schemaVersion: "v2"` で新規開始
- 設計者は v3 を起草中 → 既存 v1 / v2 案件には影響しない

切替の自動化 (案件 root の `schemaVersion` を読む loader) は本仕様の対象外、将来別 ISSUE で実装。

## 一次成果物の原則

本プロジェクトは **AI が JSON を読み取って実装する** ことを主用途とする。したがって設計層の優先順位は:

| 順位 | 層 | 役割 |
|---|---|---|
| 1 (一次) | JSON Schema (`schemas/v<N>/*.schema.json`) | 機械可読な正規仕様 |
| 2 (派生) | TypeScript 型 (`designer/src/types/*.ts`) | designer 内部のみ利用 |
| 3 (表示層) | UI (`designer/src/components/*`) | エディタとしての視覚化 |

矛盾が起きたら **schema を正、TS 型と UI を schema に合わせる**。

## ガバナンス

schema 変更権限は **フレームワーク製作者 (設計者) の専権**。詳細: [`docs/spec/schema-governance.md`](../docs/spec/schema-governance.md) (#511)。

## 関連

- 設計原則 v2: [`docs/spec/schema-design-principles.md`](../docs/spec/schema-design-principles.md)
- v2 再設計案: [`docs/spec/schema-v2-design.md`](../docs/spec/schema-v2-design.md) (#519)
- 過去監査: [`docs/spec/schema-audit-2026-04-27.md`](../docs/spec/schema-audit-2026-04-27.md)
