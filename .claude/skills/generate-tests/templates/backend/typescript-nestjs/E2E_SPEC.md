# E2E_SPEC.md — TypeScript NestJS E2E テストファイル構造規約

`/generate-tests` スキルが生成するテストファイル (`<flowName>.e2e-spec.ts`) の
構造規約とコードテンプレートを定義する。

## 1. ファイル先頭 header (D-1 / D-4 anchor)

```typescript
/**
 * E2E テスト: <httpRoute.method> <httpRoute.path> (<action.name>)
 *
 * // ===HARMONY_GENERATED_SECTION_START flowId=<flowId> actionId=<actionId>===
 * // このコメントブロックは /generate-tests スキル再実行時に overwrite される。
 * // anchor の外側 (人手追記 assertion) は保護される。
 * // ===HARMONY_GENERATED_SECTION_END===
 *
 * ProcessFlow: <flowId> (<meta.name>)
 *
 * === spec → test mapping ===
 *
 * [inputs[].required=true]
 *   → Test: missing field → 400 VALIDATION_ERROR
 *
 * [validation rules[].type=maxLength, length=N]
 *   → Test: boundary value (N+1 文字) → 400
 *   → N 文字は OK (境界値 OK テスト)
 *
 * [validation rules[].type=enum, values=[...]]
 *   → Test: enum 外の値 → 400
 *
 * [httpRoute.auth="required"]
 *   → Test: Authorization ヘッダー無し → 401
 *
 * [responses[].status=201]
 *   → Assert: response.status === 201
 *
 * [outputs[].name="<field>", type="integer"]
 *   → Assert: response.body.<field> is number
 *
 * [step.kind=dbAccess (INSERT <table>), lineage.writes]
 *   → Assert: <physicalName> テーブルに row が追加されること (Prisma findUnique)
 *
 * [step.kind=loop (collection), collectionSource=@inputs.<field>]
 *   → Assert: <childTable> に N 行追加 + 親 ID 紐付け
 *
 * [step.txBoundary (begin..end)]
 *   → TX rollback テスト: 故意 UNIQUE 違反 → 全 rollback 確認
 *
 * [step.runIf="<condition>"]
 *   → runIf=true のケース / false のケース 両方を生成
 *
 * === 申し送り事項 ===
 * TX-1: <TX 実装状況のメモ>
 */
```

## 2. import 規約

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');  // Spike L-5: ESM/CJS 混在を避けるため require を使う
import { AppModule } from '../src/app.module';
import { PrismaClient } from '@prisma/client';
```

**注意**: `import request from 'supertest'` は tsconfig の設定によっては動作しないため、
`const request = require('supertest')` を使う (Spike L-5 知見)。

## 3. beforeAll: NestJS アプリ起動 + Prisma + JWT

```typescript
beforeAll(async () => {
  // NestJS TestingModule の作成と起動
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  app = moduleFixture.createNestApplication();

  // ValidationPipe: transform=true で DTO に変換、whitelist=true で余分フィールドを除去
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: false,  // 非ホワイトリストフィールドはエラーにしない (寛容)
    }),
  );
  await app.init();

  // テスト専用 Prisma client (Spike L-6: DATABASE_URL は絶対パス対応)
  // DATABASE_URL env が設定されていれば優先、なければ相対パスを resolve して絶対パス化
  const dbPath = process.env.DATABASE_URL
    || `file:${require('path').resolve(__dirname, '../prisma/dev.db')}`;
  prisma = new PrismaClient({
    datasources: { db: { url: dbPath } },
  });

  // JWT 取得 (httpRoute.auth="required" の場合)
  // seed.ts で固定ユーザー (username="${ADMIN_USERNAME}" / password="${ADMIN_PASSWORD}") が作成済み前提
  accessToken = await loginAs${HelperName}(app);
});
```

**DATABASE_URL 絶対パス対応 (Spike L-6) の詳細**:
- `__dirname` は `test/` ディレクトリ
- `../prisma/dev.db` で `apps/api/prisma/dev.db` を指す
- `process.env.DATABASE_URL` が設定済みなら `file:` prefix の有無に注意
  (Prisma の SQLite URL 形式: `file:/absolute/path/to/db`)

## 4. beforeEach: クリーンステート

各テストを独立させるため、テストデータを前に seed し後に cleanup する。

```typescript
beforeEach(async () => {
  createdIds = {};  // cleanup 用 ID コレクションをリセット

  // テスト用マスタデータの seed (timestamp suffix で slug 衝突を避ける)
  const suffix = Date.now();
  const testRecord = await prisma.${masterModel}.create({
    data: {
      name: `${TEST_RECORD_NAME_PREFIX}-${suffix}`,
      // ... 必要なフィールド
    },
  });
  ${testRecordId} = Number(testRecord.id);
});
```

## 5. afterAll: app close

```typescript
afterAll(async () => {
  await prisma.$disconnect();
  await app.close();
});
```

## 6. afterEach: cleanup

```typescript
afterEach(async () => {
  // 子テーブルから順に削除 (FK 制約のある場合)
  for (const id of (createdIds['${childTable}'] ?? [])) {
    await prisma.${childModel}.deleteMany({ where: { ${parentIdField}: Number(id) } });
  }
  for (const id of (createdIds['${mainTable}'] ?? [])) {
    await prisma.${mainModel}.deleteMany({ where: { id: Number(id) } });
  }
  // テスト用マスタデータの削除
  if (${testRecordId}) {
    await prisma.${masterModel}.deleteMany({ where: { id: ${testRecordId} } });
  }
});
```

## 7. JWT ヘルパー関数

```typescript
/**
 * <adminRole> ユーザーで JWT を取得する。
 * seed.ts で username=${ADMIN_USERNAME} / password=${ADMIN_PASSWORD} が作成済み前提。
 */
async function loginAs${HelperName}(app: INestApplication): Promise<string> {
  const res = await request(app.getHttpServer())
    .post('/api/auth/login')
    .send({ username: '${ADMIN_USERNAME}', password: '${ADMIN_PASSWORD}' });
  return res.body.accessToken;
}
```

## 8. 各 it() の命名規約

```
#1  happy path: 全フィールド指定で <status> + <output> を返す
#2  validation: <field> 欠落 → 400
#3  validation: <field> 欠落 → 400
#N  validation: <field>=<invalidValue> → 400
#N  validation: <field> <length> 文字 (maxLength=<N> 超過) → 400
#N  validation: <field> <length> 文字 (境界値 OK) → 201
#N  auth: JWT なし → 401
#N  DB 副作用: <physicalName> テーブルに row が追加される
#N  DB 副作用: <child> N 件指定 → <childTable> に N 行 + 親 ID 紐付け
#N  TX: <constraint 違反説明> → <status> + TX rollback 確認
#N  runIf=true: <条件説明> のケース
#N  runIf=false: <条件説明> のケース
#N  compute: <status>=<value> → <field> が <expected>
```

## 9. spec 要素 → テスト構造マッピング (サマリ)

| ProcessFlow 要素 | 生成テスト種別 | assertion |
|---|---|---|
| `inputs[].required=true` | 欠落 → 400 | `expect(res.status).toBe(400)` |
| `validation.type=maxLength, length=N` | N+1 文字 → 400 / N 文字 → 201 | status 確認 |
| `validation.type=enum, values=[...]` | 不正値 → 400 | status 確認 |
| `httpRoute.auth="required"` | JWT なし → 401 | `expect(res.status).toBe(401)` |
| `responses[].status=201` | happy path | `expect(res.status).toBe(201)` |
| `outputs[].name="X", type="integer"` | happy path 内 | `typeof res.body.X === 'number'` |
| `step.dbAccess INSERT` | DB 行追加 | `prisma.Model.findUnique(...)` |
| `step.loop collection` | N 件 → N 行 | `expect(rows).toHaveLength(N)` |
| `step.txBoundary` | 故意失敗 TX | `expect(res.status).toBe(500 or 409)` + Prisma 残存確認 |
| `step.runIf` | true / false 両分岐 | 各ケースの期待動作 |
| `step.compute` | DB SELECT で値確認 | `expect(post.publishedAt).toBeNull()` 等 |
| `affectedRowsCheck.onViolation=throw` | 0 行誘起 | `expect(res.status).toBeGreaterThanOrEqual(500)` |
| `context.catalogs.errors[].httpStatus` | エラーコード対応表 | assertion 期待値に展開 |

## 10. jest-e2e.json テンプレート

```json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": [
      "ts-jest",
      {
        "tsconfig": {
          "module": "commonjs",
          "target": "ES2020",
          "lib": ["ES2020"],
          "strict": false,
          "strictNullChecks": false,
          "esModuleInterop": true,
          "experimentalDecorators": true,
          "emitDecoratorMetadata": true,
          "skipLibCheck": true
        }
      }
    ]
  },
  "moduleNameMapper": {
    "^src/(.*)$": "<rootDir>/../src/$1"
  },
  "testTimeout": 30000
}
```

**重要点**:
- `strictNullChecks: false` — Prisma の nullable 型を緩く扱う
- `moduleNameMapper` — `src/` 相対インポートを `../src/` に解決
- `testTimeout: 30000` — DB I/O を含む E2E は 30 秒タイムアウト
- SQLite 使用時は `--runInBand` を jest 実行オプションに追加 (D-7)

## 11. D-4 再生成時の anchor ベース overwrite ルール

```
既存テストファイルに対して /generate-tests を再実行する場合:

1. ファイルを Read して anchor を検索
   - `===HARMONY_GENERATED_SECTION_START flowId=X actionId=Y===` を探す
   - なければ全ファイルが「人手作成」とみなし、上書きせずに新規ファイルを生成

2. anchor が見つかった場合:
   - START から END の間のみを新しい生成内容で置換
   - END の外側 (人手追記 describe/it) は一切変更しない
   - anchor 行自体も更新する

3. anchor が複数存在する場合 (複数 action):
   - flowId + actionId の組合せで一致する anchor のみ overwrite
```

## 12. 注意事項 (Spike から得た知見)

- `PrismaClient` のコンストラクタで `datasources.db.url` を明示しないと
  環境変数 `DATABASE_URL` の相対パスが解決されない場合がある (Spike L-6)
- BigInt 型の ID を Prisma が返す場合は `Number(id)` に変換してから比較する
- `afterEach` の cleanup は子テーブル (FK 参照先) → 親テーブルの順で実行する
- `beforeEach` の seed データには `Date.now()` suffix を付けて slug/name の UNIQUE 衝突を避ける
- `ValidationPipe({ transform: true })` が設定されていないと DTO 変換が効かず
  数値型フィールドが文字列のまま渡ってバリデーションが通らないことがある
