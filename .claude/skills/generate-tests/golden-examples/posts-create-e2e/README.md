# golden-examples/posts-create-e2e

ProcessFlow `0671b051-4acc-49cf-ba92-9fa29b47f671` (投稿作成) を題材にした
`/generate-tests` スキルのゴールデン出力。

実際の Spike テスト (`~/projects/diary/apps/api/test/posts.create.e2e-spec.ts`, 614 行 / 15 件 pass)
を抽象化して、スキルが真似できる形に整理している。

## 抽象化の方針

### PLACEHOLDER 記法

diary アプリ固有の具体値を `${PLACEHOLDER}` 形式で抽象化している。
スキルが実際にテストを生成する際は、ProcessFlow JSON と harmony.json から解決した値で置換する。

| PLACEHOLDER | 解決元 | diary での具体値 |
|---|---|---|
| `${FLOW_ID}` | ProcessFlow の `meta.id` | `0671b051-4acc-49cf-ba92-9fa29b47f671` |
| `${FLOW_NAME}` | ProcessFlow の `meta.name` | `投稿作成` |
| `${ACTION_ID}` | `actions[].id` | `act-001` |
| `${ACTION_NAME}` | `actions[].name` | `投稿作成` |
| `${HTTP_ROUTE_METHOD}` | `actions[].httpRoute.method` | `POST` |
| `${HTTP_ROUTE_PATH}` | `actions[].httpRoute.path` | `/api/posts` |
| `${HTTP_ROUTE_AUTH}` | `actions[].httpRoute.auth` | `required` |
| `${OUTPUT_ID_FIELD}` | `actions[].outputs[].name` | `postId` |
| `${REQUIRED_FIELD_1}` | `inputs[required=true]` の最初 | `title` |
| `${REQUIRED_FIELD_2}` | `inputs[required=true]` の 2 番目 | `body` |
| `${TITLE_FIELD}` | `inputs[validation.maxLength]` のあるフィールド | `title` |
| `${TITLE_MAX_LENGTH}` | `validation.maxLength.length` | `200` |
| `${TITLE_MAX_LENGTH_PLUS_1}` | `TITLE_MAX_LENGTH + 1` | `201` |
| `${STATUS_FIELD}` | `inputs[validation.enum]` のあるフィールド | `status` |
| `${STATUS_ENUM_VALUES}` | `validation.enum.values` | `["draft","published"]` |
| `${STATUS_DRAFT}` | enum の最初の値 | `draft` |
| `${STATUS_PUBLISHED}` | enum の 2 番目の値 | `published` |
| `${PHOTOS_FIELD}` | `inputs[type=array]` の最初 | `photos` |
| `${TAGS_FIELD}` | `inputs[type=array]` の 2 番目 | `tags` |
| `${TABLE_MAIN}` | step-03 の `lineage.writes[0].tableId` → physicalName | `posts` |
| `${TABLE_CHILD}` | step-04 loop inner の `lineage.writes[0].tableId` → physicalName | `photos` |
| `${TABLE_JUNCTION}` | step-05 loop inner step-05-04 の `lineage.writes[0].tableId` → physicalName | `post_tags` |
| `${TABLE_MASTER}` | step-05-01/02 の `tableId` → physicalName | `tags` |
| `${MASTER_MODEL_JA}` | `TABLE_MASTER` の日本語名 | `タグ` |
| `${TX_ID}` | `txBoundary.txId` | `tx-post-create` |
| `${STEP_TX_BEGIN_ID}` | `txBoundary.role="begin"` の step.id | `step-03` |
| `${STEP_TX_END_ID}` | `txBoundary.role="end"` の step.id | `step-06` |
| `${COMPUTED_DATE_FIELD}` | `step-02.outputBinding.name` + DB カラム名 | `publishedAt` |
| `${ADMIN_USERNAME}` | seed.ts の管理者ユーザー名 | `admin` |
| `${ADMIN_PASSWORD}` | seed.ts の管理者パスワード | `diary-admin` |
| `${AdminHelper}` | ヘルパー関数名の PascalCase | `Admin` |
| `${mainModelPrisma}` | `TABLE_MAIN` のキャメルケース | `post` |
| `${childModel1Prisma}` | `TABLE_CHILD` のキャメルケース | `photo` |
| `${childModel2Prisma}` | `TABLE_JUNCTION` のキャメルケース | `postTag` |
| `${masterModelPrisma}` | `TABLE_MASTER` のキャメルケース | `tag` |
| `${parentIdField1}` | `TABLE_CHILD` の親 FK カラム (camelCase) | `postId` |
| `${parentIdField2}` | `TABLE_JUNCTION` の親 FK カラム (camelCase) | `postId` |
| `${masterFKField}` | `TABLE_JUNCTION` のマスタ FK カラム (camelCase) | `tagId` |
| `${HTTP_STATUS_ERROR}` | TX 失敗時の期待 HTTP status | `500` |
| `${BOUNDARY_CHAR}` | maxLength boundary テストの繰り返し文字 | `あ` |

### step ID マッピング

| PLACEHOLDER | ProcessFlow step.id |
|---|---|
| `${STEP_VALIDATION_ID}` | `step-01` |
| `${STEP_PUBLISH_AT_COMPUTE_ID}` | `step-02` |
| `${STEP_POSTS_INSERT_ID}` | `step-03` |
| `${STEP_MAIN_INSERT_ID}` | `step-03` |
| `${STEP_PHOTOS_LOOP_ID}` | `step-04` |
| `${STEP_CHILD_LOOP_ID}` | `step-04` |
| `${STEP_CHILD_INSERT_ID}` | `step-04-01` |
| `${STEP_TAGS_LOOP_ID}` | `step-05` |
| `${STEP_JUNCTION_LOOP_ID}` | `step-05` |
| `${STEP_JUNCTION_INSERT_ID}` | `step-05-04` |
| `${STEP_RUN_IF_SELECT_ID}` | `step-05-01` |
| `${STEP_RUN_IF_INSERT_ID}` | `step-05-02` |

## テストケース一覧 (Spike 対応)

| # | テスト内容 | spec anchor | Spike との対応 |
|---|---|---|---|
| 1 | happy path: 全フィールド → 201 + postId | act-001 responses[201] / outputs[postId] | Spike #1 |
| 2 | title 欠落 → 400 | step-01 required(title) | Spike #2 |
| 3 | body 欠落 → 400 | step-01 required(body) | Spike #3 |
| 4 | status="invalid" → 400 | step-01 enum(status) | Spike #4 |
| 5 | title 201 文字 → 400 | step-01 maxLength(200) 超過 | Spike #5 |
| 5b | title 200 文字 → 201 | step-01 maxLength(200) 境界値 OK | Spike #5b |
| 6 | JWT なし → 401 | httpRoute.auth=required | Spike #6 |
| 7 | posts に row 追加 | step-03 dbAccess INSERT posts | Spike #7 |
| 8 | photos 2 件 → photos に 2 行 | step-04 loop + step-04-01 INSERT photos | Spike #8 |
| 9 | 既存タグ → post_tags に 1 行 + source | step-05 loop + step-05-04 INSERT post_tags | Spike #9 |
| 10 | TX: 同一タグ 2 回 → 500 (TX 未実装文書化) | step-03 txBoundary begin / step-06 end | Spike #10 |
| 11 | status=draft → publishedAt null | step-02 compute | Spike #11 |
| 12 | status=published → publishedAt non-null | step-02 compute | Spike #12 |
| 13 | 新規タグ名 → tags row + post_tags | step-05-01 runIf=true / step-05-02 | Spike #13 |
| 14 | status 未指定 → draft (runIf=false ケース) | inputs[status].required=false / COALESCE | Spike #14 |

## 再生成時の section 保護

ファイル冒頭の anchor を使い、スキル再実行時に spec 由来 section のみを overwrite する:

```
// ===HARMONY_GENERATED_SECTION_START flowId=<id> actionId=<id>===
... (この間を overwrite)
// ===HARMONY_GENERATED_SECTION_END===
```

anchor の外側 (人手で追加した assertion や describe ブロック) は保護される。

## 実機検証 (Option B 方式)

Spike の `posts.create.e2e-spec.ts` を `apps/api/test/` に置いて jest を実行:

```bash
cd ~/projects/diary/apps/api
DATABASE_URL="file:$(pwd)/prisma/dev.db" npx jest --config test/jest-e2e.json --testPathPattern="posts.create" --runInBand
```

期待結果: 15/15 pass (テストケース #1〜#14 + #5b の計 15 件)

## P2 以降への申し送り

### TX-1 (重要): $transaction 未実装の場合の rollback テスト

Spike 実績では posts.service.ts が `$transaction` を使わないため、
post_tags UNIQUE 違反後も posts 行が残存する。

P2 では:
1. サービス層で `prisma.$transaction(async (tx) => { ... })` に修正 OR
2. `$transaction` 使用を検出して「TX 実装あり」パスと「TX 未実装文書化」パスを自動分岐

### STEP_CHILD_INSERT の order_index フィールド

photos の orderIndex フィールド (Prisma model: `orderIndex`) を使った順序確認テストは
Spike に含まれているが golden からは省略。P2 で追加検討。

### affectedRowsCheck.onViolation=throw テスト

ProcessFlow の `POST_CREATE_FAILED` (affectedRowsCheck.onViolation=throw, errorCode=POST_CREATE_FAILED) に対する
0 行誘起テストは P2 スコープ。強制的に INSERT 0 行を起こす方法 (mock / DB 制約) が必要。
