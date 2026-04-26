# Schema 再設計提案 (Codex セカンドオピニオン版)

> **ステータス**: 提案 (proposal). 採否は設計者 Opus + ユーザーが ISSUE #517 内で判断する.
> **作成**: Codex (GPT-5.5) via /issues 517 セカンドオピニオン依頼
> **日付**: 2026-04-27
> **スコープ**: 提案のみ. schemas/*.json および既存 spec への変更は本提案には含まれない.

## 1. 現状の構造分析 (調査結果サマリ)

### Schema statistics

対象 schema は `process-flow.schema.json` / `conventions.schema.json` / `extensions-*.schema.json` の 7 ファイルである。`process-flow.schema.json` は draft 2020-12 / `$id` / root object / root required / root `additionalProperties: false` を持つ 2036 行の中心 schema である (schemas/process-flow.schema.json:1-8, schemas/process-flow.schema.json:97-2036)。`conventions.schema.json` は同じく draft 2020-12 で、root required は `version`、root `additionalProperties: false` である (schemas/conventions.schema.json:1-9)。

AST 集計結果:

| 対象 | $defs | oneOf | oneOf variants | allOf | if/then object nodes | required arrays | required fields | additionalProperties | false / true / schema |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `schemas/process-flow.schema.json` | 106 | 14 | 81 | 23 | 6 | 96 | 236 | 119 | 95 / 7 / 17 |
| `schemas/conventions.schema.json` | 14 | 0 | 0 | 0 | 0 | 14 | 18 | 33 | 15 / 0 / 18 |
| `schemas/extensions-*.schema.json` 合計 | 3 | 1 | 2 | 0 | 0 | 10 | 21 | 15 | 11 / 0 / 4 |
| **合計** | **123** | **15** | **83** | **23** | **6** | **120** | **275** | **167** | **121 / 7 / 39** |

`process-flow.schema.json` の主要 union は `Step` の 22 variant oneOf、`NonReturnStep` の 21 variant oneOf、`FieldType` の 8 variant oneOf、`TestPrecondition` の 4 variant oneOf、`TestAssertion` の 6 variant oneOf、`BodySchemaRef` の 3 variant oneOf、`BranchConditionVariant` の 3 variant oneOf である (schemas/process-flow.schema.json:159-208, schemas/process-flow.schema.json:222-291, schemas/process-flow.schema.json:688-709, schemas/process-flow.schema.json:724-799, schemas/process-flow.schema.json:1186-1210, schemas/process-flow.schema.json:1449-1487, schemas/process-flow.schema.json:2008-2033)。`additionalProperties` は 167 箇所中 121 箇所が `false` で、使用率は 72.5% が閉じた object である。代表例として root / `Sla` / `ActionDefinition` / step variants は閉じ、`TestInvocation.input` や JSON Schema payload / response schema は開いている (schemas/process-flow.schema.json:6-9, schemas/process-flow.schema.json:111-130, schemas/process-flow.schema.json:216-219, schemas/process-flow.schema.json:369-372, schemas/process-flow.schema.json:846-873, schemas/process-flow.schema.json:1296-1300)。

### Naming conventions

schema の `properties` 配下の property key は 853 個を走査し、camelCase が 336、lowercase が 516、schema keyword の `$schema` が 1 である。中心語彙は `externalSystemCatalog` / `ambientVariables` / `screenItemRef` / `outputBinding` / `successCriteria` のような camelCase と、`id` / `name` / `type` / `description` / `actions` / `steps` の lowercase の併用である (schemas/process-flow.schema.json:10-94, schemas/process-flow.schema.json:800-833, schemas/process-flow.schema.json:846-873, schemas/process-flow.schema.json:1303-1376)。enum value は lower (`screen`, `batch`)、camelCase (`dbAccess`, `externalSystem`, `commonProcess`)、kebab-case (`approval-sequential`)、UPPER_SNAKE (`SELECT`, `READ_COMMITTED`) が役割別に使い分けられている (schemas/process-flow.schema.json:98-105, schemas/process-flow.schema.json:297-323, schemas/process-flow.schema.json:521-539, schemas/process-flow.schema.json:1074-1077, schemas/process-flow.schema.json:1949-1955)。

catalog key は `errorCatalog` / `externalSystemCatalog` / `envVarsCatalog` / `domainsCatalog` / `functionsCatalog` では `additionalProperties` による任意 key で、key 自体への pattern 制約はない (schemas/process-flow.schema.json:25-68)。一方、拡張 namespace は `^[a-z0-9_-]*$` に制約され、custom step type は `namespace:StepName` を `^[a-z][a-z0-9_-]*:[A-Z][A-Za-z0-9]*$` で受ける (schemas/extensions-steps.schema.json:9-16, schemas/process-flow.schema.json:1862-1866)。

### Structural patterns

標準 step は `StepBaseProps` を `allOf` で合成し、各 variant 側で共通プロパティを `true` として再列挙し、`type` を `const` で固定する形である (schemas/process-flow.schema.json:939-967, schemas/process-flow.schema.json:1046-1071, schemas/process-flow.schema.json:1097-1130, schemas/process-flow.schema.json:1303-1378)。この構造は discriminator としては明確だが、`StepBaseProps` と各 variant の許可プロパティ列挙が二重管理になる。`WorkflowStep` は `pattern` に応じて `escalateAfter` / `escalateTo` / `quorum` を条件必須にする `if` / `then` を持つ (schemas/process-flow.schema.json:1784-1847)。`Sla` も `onTimeout` が `throw` / `compensate` のとき `errorCode` を要求する (schemas/process-flow.schema.json:111-130)。

拡張 schema は core schema と分離されている。`extensions-field-types` / `extensions-db-operations` / `extensions-triggers` は配列で `value` または `kind` と `label` だけを持ち、`extensions-response-types` は `responseTypes` object、`extensions-steps` は `steps` object と簡易 `DynamicFormSchema` を持つ (schemas/extensions-field-types.schema.json:13-24, schemas/extensions-db-operations.schema.json:13-24, schemas/extensions-triggers.schema.json:13-24, schemas/extensions-response-types.schema.json:13-27, schemas/extensions-steps.schema.json:13-57)。

### Coverage of the 19 spec docs

`docs/spec/README.md` は README を除く 19 spec doc を列挙し、一次成果物を JSON Schema と明記している (docs/spec/README.md:7-31)。process-flow 系は schema に広く反映されている。SLA は `ProcessFlow` / `ActionDefinition` / `StepBase` の同一意味フィールドとして仕様化され、schema でも root / action / step base に配置されている (docs/spec/process-flow-sla.md:13-39, schemas/process-flow.schema.json:21-24, schemas/process-flow.schema.json:858-859, schemas/process-flow.schema.json:950-951)。環境変数と secrets は `envVarsCatalog` / `secretsCatalog` として root catalog に入っている (docs/spec/process-flow-env-vars.md:15-21, docs/spec/process-flow-secrets.md:13-21, schemas/process-flow.schema.json:45-54, schemas/process-flow.schema.json:592-631)。Arazzo 由来の `Criterion` は string 後方互換を維持しつつ構造化型を追加している (docs/spec/process-flow-criterion.md:7-19, schemas/process-flow.schema.json:1156-1184)。

一方で、runtime conventions は schema 制約外の規約を集約する設計で、SQL prepared statement 展開、HTTP body serialize、TX と例外の連鎖、fireAndForget の意味論、ambient default 解決順などは schema だけでは検証しない (docs/spec/process-flow-runtime-conventions.md:7-8, docs/spec/process-flow-runtime-conventions.md:17-27, docs/spec/process-flow-runtime-conventions.md:57-97, docs/spec/process-flow-runtime-conventions.md:98-123, docs/spec/process-flow-runtime-conventions.md:245-313)。screen-items と list-common は ProcessFlow 周辺 UI / 画面項目連携の仕様であり、`StructuredField.screenItemRef` は schema に入っているが、一覧 UI 操作規約自体は schema 対象ではない (docs/spec/screen-items.md:123-132, docs/spec/screen-items.md:386-399, schemas/process-flow.schema.json:815-824, docs/spec/list-common.md:238-247)。plugin-system は拡張ファイルと合成 schema 検証を定義するが、core schema は拡張値を直接 enum に取り込まず、拡張 schema 側に分離している (docs/spec/plugin-system.md:31-41, docs/spec/plugin-system.md:247-248, schemas/extensions-steps.schema.json:1-59)。

サンプル ProcessFlow は現存 4 件で、要求された 5-10 件はリポジトリ上存在しないため 4 件すべてを読了した。各ファイルは 1 action を持ち、標準 step type のみを使用している。`gggggggg-0003` は `transactionScope` を実使用し、response は 4 ファイル全てで `{ "typeRef": ... }` を使う (docs/sample-project/process-flows/gggggggg-0003-4000-8000-gggggggggggg.json:557, docs/sample-project/process-flows/gggggggg-0001-4000-8000-gggggggggggg.json:282-300, docs/sample-project/process-flows/gggggggg-0002-4000-8000-gggggggggggg.json:283-319, docs/sample-project/process-flows/gggggggg-0003-4000-8000-gggggggggggg.json:314-356, docs/sample-project/process-flows/gggggggg-0004-4000-8000-gggggggggggg.json:334-370)。拡張サンプルは `response-types.json` と `retail` namespace の `db-operations` / `field-types` / `steps` / `triggers` が存在する (docs/sample-project/extensions/response-types.json:1-84, docs/sample-project/extensions/retail/db-operations.json:1-13, docs/sample-project/extensions/retail/field-types.json:1-13, docs/sample-project/extensions/retail/steps.json:1-68, docs/sample-project/extensions/retail/triggers.json:1-13)。

## 2. 現行 schema の強み (維持すべき設計)

第一に、一次成果物が JSON Schema である点は維持すべきである。README は JSON Schema を一次成果物とし、TypeScript 型と UI を後続層に置く (docs/spec/README.md:31-39, AGENTS.md:147-156)。この構造により、AI 実装者は TypeScript 実装詳細ではなく、`schemas/process-flow.schema.json` を正規入力として読める (schemas/process-flow.schema.json:1-8)。

第二に、閉じた object を基本とする方針は強い。root、catalog entry、ActionDefinition、step variants の多くが `additionalProperties: false` で、誤字や存在しないフィールドを schema validation で検出できる (schemas/process-flow.schema.json:6-9, schemas/process-flow.schema.json:634-642, schemas/process-flow.schema.json:846-873, schemas/process-flow.schema.json:1097-1130)。ただし JSON Schema payload や response schema のような本質的に開くべき領域は `additionalProperties: true` または schema object として残している (schemas/process-flow.schema.json:369-372, schemas/process-flow.schema.json:1296-1300)。

第三に、step discriminator は `type` に統一されている。`StepType` enum、各 step variant の `type: { const: ... }`、最後の `Step.oneOf` が同じ値集合で対応している (schemas/process-flow.schema.json:297-323, schemas/process-flow.schema.json:1046-1071, schemas/process-flow.schema.json:2008-2033)。この一貫性は ProcessFlowEditor のカード切替、JSON 入力補完、AI 読解のすべてに効く。

第四に、後方互換のための union が明示されている。`ActionFields` は string と `StructuredField[]`、`BodySchemaRef` は string / `{typeRef}` / `{schema}`、`Criterion` は string / structured object、`OutputBinding` は string / object を受ける (schemas/process-flow.schema.json:688-709, schemas/process-flow.schema.json:835-843, schemas/process-flow.schema.json:908-913, schemas/process-flow.schema.json:1178-1184)。spec 側も string 互換を残す判断を明記している (docs/spec/process-flow-criterion.md:16-19, docs/spec/process-flow-extensions.md:55-60)。

第五に、業務横断の catalog 化は有効である。`externalSystemCatalog` は外部連携の auth / baseUrl / timeout / retry / headers を集約し、`errorCatalog` は errorCode の散在を抑える (schemas/process-flow.schema.json:25-34, schemas/process-flow.schema.json:1276-1301, docs/spec/process-flow-extensions.md:220-270, docs/spec/process-flow-extensions.md:577-589)。`conventions.schema.json` は `@conv.msg.*` / `@conv.regex.*` / `@conv.limit.*` / `@conv.scope.*` 等の横断規約を体系化している (schemas/conventions.schema.json:20-85)。

第六に、拡張機構を core schema と分けたことは governance と整合する。グローバル schema は設計者専権で、業務開発者は namespace 拡張と catalog で対応する (docs/spec/schema-governance.md:5-12, docs/spec/schema-governance.md:37-69, AGENTS.md:14-23)。plugin-system も enum 拡張は追加のみ、step / response-type は同名 key で plugin 側上書きを許す運用を規定している (docs/spec/plugin-system.md:31-41)。

## 3. 現行 schema の課題 (改善余地)

1. step variant 追加の編集面が広い。新しい標準 step type を追加するには、`StepType` enum、該当 `$defs`、`Step.oneOf`、`NonReturnStep.oneOf`、必要なら sideEffects などを同時に更新する必要がある構造である (schemas/process-flow.schema.json:297-323, schemas/process-flow.schema.json:1186-1210, schemas/process-flow.schema.json:2008-2033)。これは governance 上の専権変更としては正しいが、設計者が変更する場合でも漏れやすい。

2. `StepBaseProps` と variant の許可プロパティ列挙が二重管理である。`StepBaseProps` は共通フィールドを宣言するが、各 variant は `additionalProperties: false` のため `id`, `description`, `note`, `notes`, `maturity`, `runIf`, `outputBinding`, `txBoundary`, `transactional`, `compensatesFor`, `externalChain`, `subSteps`, `requiredPermissions`, `sla` を `true` で繰り返している (schemas/process-flow.schema.json:939-967, schemas/process-flow.schema.json:1046-1058, schemas/process-flow.schema.json:1104-1109, schemas/process-flow.schema.json:1309-1315)。実際に `WorkflowStep` と `TransactionScopeStep` は共通列挙から `sla` が抜けているため、共通 base にあるのに variant では許可されない差分が発生している (schemas/process-flow.schema.json:1789-1797, schemas/process-flow.schema.json:1963-1970)。

3. `OtherStep` は拡張 step の入口として有効だが、拡張 step 固有 schema と core validation の接続が弱い。`type` は `other` または `namespace:StepName` を受け、`outputSchema` は string map だけを持つ (schemas/process-flow.schema.json:1850-1874)。一方、`extensions-steps.schema.json` は `steps.<StepName>.schema` に DynamicFormSchema を持つが、ProcessFlow 本体の `namespace:StepName` と拡張定義の存在・プロパティ整合は単体 schema では保証しない (schemas/extensions-steps.schema.json:13-57, docs/spec/plugin-system.md:247-248)。

4. expression 系フィールドはすべて string のままで、補完と静的検査が弱い。spec は `js-subset` BNF、禁止構文、式が現れるフィールド一覧を定義しているが、schema 上は `runIf`, `expression`, `bodyExpression`, `conditionExpression`, `collectionSource`, `headers` value などが string である (docs/spec/process-flow-expression-language.md:7-20, docs/spec/process-flow-expression-language.md:138-160, schemas/process-flow.schema.json:952-957, schemas/process-flow.schema.json:1640-1654, schemas/process-flow.schema.json:1659-1674, schemas/process-flow.schema.json:1568-1579, schemas/process-flow.schema.json:1359-1362)。これは AI 実装には十分でも IDE 補完・lint では弱い。

5. catalog key の pattern と参照整合性が schema 単体では薄い。`errorCatalog` や `externalSystemCatalog` の key は任意 object key で、`affectedRowsCheck.errorCode`, `BranchConditionVariant.errorCode`, `ExternalSystemStep.systemRef`, `HttpResponseSpec.bodySchema.typeRef` との存在整合は別 validator に委ねられている (schemas/process-flow.schema.json:25-34, schemas/process-flow.schema.json:1082-1095, schemas/process-flow.schema.json:1453-1460, schemas/process-flow.schema.json:1317-1320, schemas/process-flow.schema.json:688-709, schemas/README.md:67)。plugin-system も `typeRef` 解決には extensions を読む経路が必要と書いている (docs/spec/plugin-system.md:357-378)。

6. conventions catalog は schema と runtime 規約の境界が複雑である。`default: true` の ambient default は runtime conventions が対象カテゴリを `scope` / `currency` / `tax` / `auth` / `db` の 5 つに限定するが、schema 側では `default` property を各 entry に置くに留まり、カテゴリ内で複数 default があるケースは未定義である (docs/spec/process-flow-runtime-conventions.md:259-267, schemas/conventions.schema.json:171-219, schemas/conventions.schema.json:245-255)。

7. サンプル拡張の使用ルールに検証の穴がある。process-flow-extensions は拡張定義を追加した同 PR 内で対応サンプルフロー JSON がその拡張を実体使用することを要求する (docs/spec/process-flow-extensions.md:1126-1128)。現存 retail 拡張は `CartManageStep` / `OrderConfirmStep` / `InventoryReserveStep` / `ShipmentDispatchStep` を定義するが、4 件の process-flow sample は標準 step type のみを使用し、retail namespace は decisions の文脈説明に留まる (docs/sample-project/extensions/retail/steps.json:3-68, docs/sample-project/process-flows/gggggggg-0002-4000-8000-gggggggggggg.json:129-131, docs/sample-project/process-flows/gggggggg-0004-4000-8000-gggggggggggg.json:141-143)。これは schema の欠陥というより、拡張 usage validator の責務である。

## 4. 再設計案

### 4-A. 将来拡張性

新しい標準 step type の追加 friction は、`StepType` / `$defs` / `Step.oneOf` / `NonReturnStep.oneOf` の同期にある (schemas/process-flow.schema.json:297-323, schemas/process-flow.schema.json:1186-1210, schemas/process-flow.schema.json:2008-2033)。提案は、`$defs/Step` を「core steps」「extension steps」「restricted side-effect steps」に分けることである。たとえば `$defs/CoreStep` が標準 21 種、`$defs/ExtensionStep` が `namespace:StepName`、`$defs/NonReturnCoreStep` が Return を除外した variant を持つ。現行 `OtherStep` は互換 alias として残し、将来の `ExtensionStep` に意味を寄せる。

discriminated union は `type` discriminator を維持する。各 variant の `type: const` はコード補完に効いているため残す (schemas/process-flow.schema.json:1046-1071, schemas/process-flow.schema.json:1097-1130, schemas/process-flow.schema.json:1303-1378)。ただし `StepBaseProps` の二重列挙は設計者変更時の漏れを生むため、draft 2020-12 の `unevaluatedProperties: false` を検討する。`allOf` で base と variant を合成し、base 側で評価済みの共通プロパティを再列挙しない形にできれば、`WorkflowStep` / `TransactionScopeStep` の `sla` 抜けのような差分を防げる (schemas/process-flow.schema.json:939-967, schemas/process-flow.schema.json:1789-1797, schemas/process-flow.schema.json:1963-1970)。

catalog type の追加 friction は、root catalog が ProcessFlow 内部に増え続ける点にある。現在 root には `errorCatalog`, `externalSystemCatalog`, `secretsCatalog`, `envVarsCatalog`, `domainsCatalog`, `functionsCatalog`, `eventsCatalog`, `glossary`, `decisions` が並ぶ (schemas/process-flow.schema.json:25-79)。再設計では root catalog を `catalogs` object にまとめる案を検討できるが、既存 JSON の rewrite が大きいため、短期案は現行 root field を維持し、各 catalog entry に任意 `version`, `deprecated`, `replacedBy` を共通追加する方が低リスクである。deprecated はすでに `FieldType.custom` と `ExternalSystemStep.protocol` で使われているため、概念は導入済みである (schemas/process-flow.schema.json:787-797, schemas/process-flow.schema.json:1321-1325)。

`$id` strategy は現行の raw GitHub main URL を維持しつつ、将来の major schema では `/schemas/v2/process-flow.schema.json` の安定 URL を別に持つ案を推す。現行 `$id` は main branch 直参照なので、IDE cache と過去ファイル再検証の観点では versioned URL が欲しい (schemas/process-flow.schema.json:1-5, schemas/conventions.schema.json:1-5)。ただし governance の「設計者専権」は絶対に維持し、schema redesign は ISSUE #517 承認後の専用 PR に分ける (docs/spec/schema-governance.md:5-29, AGENTS.md:14-27)。

### 4-B. 各種設計書画面でのコード補完

ProcessFlowEditor は `Step.type`, `ActionDefinition.trigger`, `HttpRoute.method`, `WorkflowPattern`, `DbOperation`, `FieldType.kind` などの enum / const から直接補完できる (schemas/process-flow.schema.json:293-323, schemas/process-flow.schema.json:521-539, schemas/process-flow.schema.json:724-799, schemas/process-flow.schema.json:846-873)。Designer は `screenItemRef` と ScreenItem の `id` / `type` / validation 制約を接続する必要がある (schemas/process-flow.schema.json:815-824, docs/spec/screen-items.md:123-132)。TableEditor / ER diagram は `tableId`, `tableName`, `FieldType.tableRow`, `FieldType.tableList` との補完接続が対象になる (schemas/process-flow.schema.json:750-767, schemas/process-flow.schema.json:1110-1112)。Extensions panel は `extensions-*.schema.json` の namespace / array / object 形に従い、step extension の DynamicFormSchema を編集する (schemas/extensions-steps.schema.json:13-57, docs/spec/plugin-system.md:329-335)。

JSON Schema から TypeScript を生成するなら、現行 schema は `properties.<name>: true` を多用するため、json-schema-to-typescript / quicktype の出力が粗くなる箇所がある (schemas/process-flow.schema.json:421-426, schemas/process-flow.schema.json:1053-1058, schemas/process-flow.schema.json:1104-1109)。再設計では共通 base を `allOf` + `unevaluatedProperties: false` に寄せ、variant 側の `true` 許可を減らす。これにより生成型は `StepBase & { type: "validation"; ... }` に近づき、IDE の補完精度が上がる。

JSON ファイルの IntelliSense には `$schema` header が必要である。conventions sample は `$schema` を持つが、ProcessFlow sample の `$schema` 利用は現行 schema の root properties に含まれていないため、ProcessFlow JSON に `$schema` を入れると root `additionalProperties: false` に抵触する (schemas/process-flow.schema.json:6-9, docs/sample-project/conventions/conventions-catalog.json:1-5, schemas/conventions.schema.json:10-13)。提案は、ProcessFlow root に `$schema` optional を追加する案を ISSUE #517 で検討することである。これは既存 JSON を壊さず IDE association を強化するが、global schema 変更なので設計者承認が必要である (docs/spec/schema-governance.md:37-69)。

具体 enum / const の強化では、`ExternalAuth.tokenRef` の `@secret.*` / `ENV:` / `SECRET:`、`ambientOverrides` value の `@conv.*`、`ValidationRule.patternRef` の `@conv.regex.*`、`minRef` / `maxRef` の `@conv.limit.*` に `pattern` を追加できる (docs/spec/process-flow-runtime-conventions.md:205-213, docs/spec/process-flow-runtime-conventions.md:279-300, schemas/process-flow.schema.json:990-1004)。ただし現行データ互換のため、初期は warning validator に留め、schema hard constraint は v2 または strict mode に限定する。

### 4-C. 拡張機構による拡張性

現在の extension mechanism は、field-types / triggers / db-operations が enum 値追加、steps が DynamicFormSchema、response-types が JSON Schema body type を担う (schemas/extensions-field-types.schema.json:13-24, schemas/extensions-db-operations.schema.json:13-24, schemas/extensions-triggers.schema.json:13-24, schemas/extensions-steps.schema.json:13-57, schemas/extensions-response-types.schema.json:13-27)。plugin-system は、グローバル値の重複定義禁止、enum 拡張は追加のみ、custom step と response-type は plugin 側上書きを許すと定義している (docs/spec/plugin-system.md:31-41, docs/spec/plugin-system.md:247-248)。

第三者 plugin / 業界 vertical plugin が core を触らずに拡張できる範囲は、現状では UI 選択肢、custom step のフォーム、response type の共有 schema、業務規約 catalog である (docs/spec/plugin-system.md:83-120, docs/spec/plugin-system.md:329-335, docs/spec/schema-governance.md:30-35)。一方、標準 step の実行意味論、catalog の新種追加、reference integrity の新ルール、runtime conventions の新章は global spec / schema 側の設計者判断が必要である (docs/spec/schema-governance.md:37-86)。

`OtherStep.type: "namespace:Name"` pattern は有用だが限界がある。pattern は type 名の構文だけを検証し、`docs/sample-project/extensions/<namespace>/steps.json` に当該 StepDef が存在するか、DynamicFormSchema の required を ProcessFlow step が満たすかは core schema では検証しない (schemas/process-flow.schema.json:1862-1871, schemas/extensions-steps.schema.json:19-57)。提案は、core schema を肥大化させず、extension registry loader が `ProcessFlow + extensions` から合成 schema を作る二段検証を正式仕様にすることである。plugin-system はすでに合成 schema 検証を述べているため、その責務を明文化する (docs/spec/plugin-system.md:247-248, docs/spec/plugin-system.md:357-378)。

extension schema versioning は現行ファイルに存在しない。`namespace` は必須だが `version` / `schemaVersion` はない (schemas/extensions-steps.schema.json:6-16, schemas/extensions-response-types.schema.json:6-16)。提案は、各 extension file に optional `version`, `requiresCoreSchema`, `deprecated` を追加する案である。初期は optional にして既存拡張を維持し、Extensions panel で互換警告を出す。これは governance 上 global schema 変更なので ISSUE #517 承認対象である (docs/spec/schema-governance.md:81-86)。

### 4-D. 既存機能の維持 (regression 防止)

| 現行で実現していること | 再設計案での扱い | 同等 / 強化 / 退化 |
|---|---|---|
| `type` discriminator による 22 step variant | `type` const は維持し、`CoreStep` / `ExtensionStep` に階層化 | 強化 |
| `ActionFields = string \| StructuredField[]` の後方互換 | v1 では維持、v2 strict で structured 推奨 warning | 同等 |
| `BodySchemaRef = string \| {typeRef} \| {schema}` | 維持し、`typeRef` は extension registry で存在検査 | 強化 |
| `Criterion = string \| StructuredCriterion` | 維持し、Arazzo `$` 記法の lint を追加 | 強化 |
| `StepBase.runIf` / expression string | 互換維持、式 parser lint と補完 metadata を追加 | 強化 |
| `externalSystemCatalog` による DRY 化 | root field は維持し、entry version/deprecated を検討 | 強化 |
| `secretsCatalog` / `envVarsCatalog` | 互換維持、参照 pattern と解決 validator を追加 | 強化 |
| `screenItemRef` による ScreenItem 連携 | 維持し、Designer / ProcessFlowEditor 間の補完を強化 | 強化 |
| `transactionScope` meta-step | 維持し、nested `txBoundary` 禁止は validator に移す | 強化 |
| `WorkflowStep` 11 patterns | 維持し、条件必須の if/then を保持 | 同等 |
| plugin extension files | 維持し、versioning と合成 schema 検証を追加 | 強化 |
| root `additionalProperties: false` | 維持し、必要なら `$schema` optional だけ承認検討 | 同等 |

根拠: step union は schemas/process-flow.schema.json:2008-2033、ActionFields は schemas/process-flow.schema.json:835-843、BodySchemaRef は schemas/process-flow.schema.json:688-709、Criterion は schemas/process-flow.schema.json:1178-1184、runtime expression 仕様は docs/spec/process-flow-expression-language.md:138-160、catalog 群は schemas/process-flow.schema.json:25-68、screenItemRef は schemas/process-flow.schema.json:815-824、transactionScope は schemas/process-flow.schema.json:1957-2005、WorkflowStep は schemas/process-flow.schema.json:1784-1847、extension schema は schemas/extensions-steps.schema.json:1-59。

## 5. 採用しない代替案 (検討したが棄却)

1. core schema を完全に plugin-first にして、標準 step も extensions 配下へ外出しする案は採用しない。標準 step は ProcessFlow の中核語彙であり、`Step.oneOf` と `type: const` による補完・検証が AI 実装者に有効である (schemas/process-flow.schema.json:297-323, schemas/process-flow.schema.json:2008-2033)。plugin-system も「グローバルに入れるべきものはグローバルに」と明記している (docs/spec/plugin-system.md:11-18)。

2. expression をすべて `{ lang, src }` object に置き換える案は採用しない。spec はすでにこの案を不採用とし、現時点では `js-subset` 1 種のみで、既存データ全件 migration が必要になると判断している (docs/spec/process-flow-expression-language.md:13-20)。本提案では string 互換を残した lint / completion 強化を推す。

3. `catalogs` root object への全面再編は短期採用しない。root catalog は増えているが、既存 ProcessFlow 4 件と将来の実データ全件 rewrite、UI / validator / MCP tools の更新が必要になる (schemas/process-flow.schema.json:25-79, docs/spec/README.md:31-39)。短期は現行 root fields に version/deprecated などを足す方が regression が少ない。

## 6. 移行コスト見積もり

既存 sample ProcessFlow JSON の rewrite 対象は、現存ファイル数として 4 件である。要求された 5-10 件は `docs/sample-project/process-flows/*.json` に存在せず、実在する 4 件は `gggggggg-0001` から `gggggggg-0004` である (docs/sample-project/process-flows/gggggggg-0001-4000-8000-gggggggggggg.json:1-20, docs/sample-project/process-flows/gggggggg-0002-4000-8000-gggggggggggg.json:1-20, docs/sample-project/process-flows/gggggggg-0003-4000-8000-gggggggggggg.json:1-20, docs/sample-project/process-flows/gggggggg-0004-4000-8000-gggggggggggg.json:1-20)。本提案の短期案は互換維持なので、rewrite 必須件数は 0 件である。`$schema` root optional を採用する場合も既存 JSON は変更不要である (schemas/process-flow.schema.json:6-9)。

TypeScript type regeneration scope は `designer/src/types/action.ts` の ProcessFlow / Step / FieldType / extension-related types が中心になる。AGENTS は TypeScript 型を schema の派生物、UI を最後尾と定義している (AGENTS.md:147-156)。`StepBaseProps` の重複除去や `ExtensionStep` 導入を採用する場合、ProcessFlowEditor の step card 型分岐、validator、MCP export/import、extensions loader の型が影響範囲になる。画面は ProcessFlowEditor / Designer / TableEditor / ER diagram / Extensions panel の補完経路に影響する (AGENTS.md:85-100, docs/spec/plugin-system.md:329-335, docs/spec/screen-items.md:197-211)。

spec doc update scope は、少なくとも `process-flow-extensions.md`, `process-flow-runtime-conventions.md`, `process-flow-expression-language.md`, `plugin-system.md`, `schema-governance.md`, `docs/spec/README.md` である。現行 README は対象 spec と一次成果物を列挙しており、変更時は spec 側を更新してから実装すると明記する (docs/spec/README.md:7-39)。extension versioning を採用する場合は `plugin-system.md` と `extensions-*.schema.json` の仕様節が必要になる (docs/spec/plugin-system.md:83-120, schemas/extensions-steps.schema.json:1-59)。

Backward compatibility layer は実現可能である。現行 schema はすでに string / structured union と deprecated field を使って互換 migration を段階化している (schemas/process-flow.schema.json:688-709, schemas/process-flow.schema.json:787-797, schemas/process-flow.schema.json:1321-1325)。`migrateProcessFlow` による optional / union 追加の方針も spec に記載されている (docs/spec/process-flow-extensions.md:823-839)。したがって v1.1 では additive schema、v2 で strict mode、validator warning で移行促進という段階設計が妥当である。

## 7. Opus への引き継ぎ事項

ISSUE #517 Phase 2-4 で議論すべき第一点は、`StepBaseProps` の二重列挙を残すか、`unevaluatedProperties: false` を使う構造へ移るかである。現行は閉じた object の強さを保つ一方、variant ごとの共通 property 許可漏れが発生し得る (schemas/process-flow.schema.json:939-967, schemas/process-flow.schema.json:1789-1797, schemas/process-flow.schema.json:1963-1970)。

第二点は、extension step の二段検証を正式化するかである。`OtherStep.type` は `namespace:StepName` を受けるが、extension registry との存在・shape 整合は単体 schema では担保しない (schemas/process-flow.schema.json:1850-1874, schemas/extensions-steps.schema.json:13-57)。plugin-system は合成 schema 検証をすでに示すため、Opus 案が core schema 内完結を志向する場合、本提案とは衝突する (docs/spec/plugin-system.md:247-248, docs/spec/plugin-system.md:357-378)。

第三点は、IDE 補完のために ProcessFlow root `$schema` を許可するかである。conventions catalog は `$schema` を root property として許可し、sample でも使っているが、ProcessFlow root は現在 `$schema` を許可しない (schemas/conventions.schema.json:10-13, docs/sample-project/conventions/conventions-catalog.json:1-5, schemas/process-flow.schema.json:6-9)。本提案は `$schema` optional 追加を強く推すが、これは global schema 変更なので governance 上は ISSUE #517 承認が前提である (docs/spec/schema-governance.md:21-29, docs/spec/schema-governance.md:81-86)。

第四点は、confirmed decisions を戻さないことである。schema governance #511 は維持する (docs/spec/schema-governance.md:1-29, AGENTS.md:14-27)。ProcessFlow rename の方向性は AGENTS の命名注意に従う (AGENTS.md:147-160)。plugin system #442 の「source を触らず拡張」は維持する (docs/spec/plugin-system.md:1-18, docs/spec/plugin-system.md:404-428)。Arazzo / GeneXus / Power Platform / Wagby 由来の比較結果は、Criterion / Domain / ValidationRule.kind / env vars / transactionScope / functionsCatalog として現行 schema に反映済みなので、再設計でも廃止しない (schemas/process-flow.schema.json:51-63, schemas/process-flow.schema.json:645-686, schemas/process-flow.schema.json:973-987, schemas/process-flow.schema.json:1156-1184, schemas/process-flow.schema.json:1957-2005)。

本提案が最も強く主張するのは、core schema を「閉じた標準語彙」として維持しながら、extension registry との合成検証、IDE 補完、version/deprecation metadata を追加する方向である。Opus 案が全面的な root 再編や expression object 化を提案する場合、移行コストと既存の後方互換 union 方針に照らして慎重に比較すべきである (docs/spec/process-flow-expression-language.md:13-20, schemas/process-flow.schema.json:688-709, schemas/process-flow.schema.json:835-843, schemas/process-flow.schema.json:1178-1184)。
