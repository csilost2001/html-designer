# JSON Schema (処理フロー一次成果物)

このディレクトリは、html-designer の JSON 資産の**正規スキーマ**を保持する。designer フロントエンドの外 (別リポジトリの AI エージェント、CI パイプライン、外部エディタ等) からでも spec に準拠してデータを検証・生成できるようにする。

## 位置づけ

本プロジェクトは **AI が処理フロー JSON を読み取って実装する** ことを主用途とする。したがって:

- **JSON スキーマが一次成果物**
- TypeScript 型 (`designer/src/types/action.ts`) は designer 内部でのみ利用される派生物
- UI は最後尾の表示層に過ぎない

この原則は `docs/spec/process-flow-extensions.md` 等の仕様と本スキーマを突合させることで担保する。

## ファイル

| ファイル | 対象 | TS 型 |
|----------|------|-------|
| `process-flow.schema.json` | ActionGroup (処理フロー定義) | `ActionGroup` @ `designer/src/types/action.ts` |

スキーマドラフト: **JSON Schema 2020-12**

## 使い方

### 外部プロジェクト (別 AI エージェント / CI) からの検証

```ts
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import schema from "./schemas/process-flow.schema.json" assert { type: "json" };

const ajv = new Ajv2020({ allErrors: true, strict: false });
addFormats(ajv);
const validate = ajv.compile(schema);

const ok = validate(actionGroupJson);
if (!ok) {
  console.error(validate.errors);
}
```

`$id`: `https://raw.githubusercontent.com/csilost2001/html-designer/main/schemas/process-flow.schema.json` — 外部から参照する場合はこの URL を使用。main ブランチの最新版を指す。特定バージョンに固定したい場合はコミット SHA を含む raw URL を使う (例: `.../html-designer/<SHA>/schemas/process-flow.schema.json`)。

### 本リポジトリ内の検証テスト

```bash
cd designer
npx vitest run src/schemas/                  # スキーマ検証 + 参照整合性の両方
npx vitest run src/schemas/process-flow.schema.test.ts       # スキーマ準拠だけ
npx vitest run src/schemas/referentialIntegrity.test.ts      # 参照整合性だけ
```

`docs/sample-project/actions/*.json` の全ファイルを自動検証する。新しいサンプルを追加する場合も、このテストを通過させる必要がある。

### 参照整合性 (Schema だけでは検査できない規約)

JSON Schema 2020-12 では他フィールド値への参照検証 (cross-reference) が表現困難なため、スキーマの外に `designer/src/schemas/referentialIntegrity.ts` を置いて検証する:

- `ReturnStep.responseRef` / `ValidationStep.inlineBranch.ngResponseRef` / `ErrorCatalogEntry.responseRef` が `action.responses[].id` に存在すること
- `DbAccessStep.affectedRowsCheck.errorCode` / `BranchConditionVariant.errorCode` (tryCatch) が `ActionGroup.errorCatalog` のキーに存在すること (errorCatalog 定義時のみ)
- ネスト構造 (`loop.steps` / `branch.branches[].steps` / `externalSystem.outcomes.*.sideEffects` / `subSteps`) も再帰的に検査

```ts
import { checkReferentialIntegrity } from "./schemas/referentialIntegrity";
const issues = checkReferentialIntegrity(actionGroup);
// issues.length === 0 なら OK
```

## バージョニング方針

- **Phase B 時点で初版** (2026-04-20)
- 後方互換を破壊する変更時はスキーマを別ファイル (`process-flow.v2.schema.json` 等) に分けて、旧版を残す
- フィールド追加は optional で加える (既存データは影響を受けない)
- TypeScript 型を変更した場合は本スキーマも同時に更新し、テストで突合確認 (`npx vitest` 必須)

## 対応する仕様書

- [`docs/spec/process-flow-extensions.md`](../docs/spec/process-flow-extensions.md) — Phase B スキーマ拡張の網羅リファレンス
- [`docs/spec/process-flow-maturity.md`](../docs/spec/process-flow-maturity.md) — 成熟度・付箋・モード (Phase 1 基盤)
- [`docs/spec/process-flow-variables.md`](../docs/spec/process-flow-variables.md) — 変数・入出力・outputBinding (Phase 1 基盤)

## 関連コード

- `designer/src/types/action.ts` — TypeScript 型定義 (本スキーマと同期保守)
- `designer/src/utils/actionMigration.ts` — 旧形式からの変換 (新スキーマは旧形式も union 側で受け入れる)
- `designer/src/schemas/process-flow.schema.test.ts` — サンプル検証 + negative ケース
