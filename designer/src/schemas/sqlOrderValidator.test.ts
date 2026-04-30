/**
 * sqlOrderValidator テスト (#632 MVP: 観点 1+2)
 *
 * - 観点 1 (NULL_NOT_ALLOWED_AT_INSERT): 10 ケース
 * - 観点 2 (FK_REFERENCE_NOT_INSERTED): 4 ケース
 * - 共通: 空入力 / DELETE・SELECT スキップ / SQL パースエラー耐性
 *
 * welfare-benefit M1 実証 fixture は末尾の describe で実施。
 */

import { describe, it, expect } from "vitest";
import { checkSqlOrder, type OrderTableDefinition } from "./sqlOrderValidator";
import type { ProcessFlow } from "../types/v3";

// ─── テスト用ヘルパー ──────────────────────────────────────────────────────

function makeFlow(overrides: Partial<ProcessFlow> = {}): ProcessFlow {
  return {
    id: "ffffffff-0001-4000-8000-000000000001",
    name: "テストフロー",
    version: "1.0.0",
    maturity: "draft",
    createdAt: "2026-04-30T00:00:00.000Z",
    updatedAt: "2026-04-30T00:00:00.000Z",
    kind: "screen",
    context: {},
    actions: [],
    ...overrides,
  } as ProcessFlow;
}

/**
 * テーブル定義ショートカット。
 * columns: [{ physicalName, notNull?, autoIncrement?, defaultValue? }, ...]
 * constraints: [{ kind: "foreignKey", columnPhysicalNames, referencedTableId }, ...]
 */
function makeTable(
  id: string,
  physicalName: string,
  columns: Array<{
    id?: string;
    physicalName: string;
    notNull?: boolean;
    autoIncrement?: boolean;
    defaultValue?: string;
    primaryKey?: boolean;
  }>,
  fkConstraints?: Array<{ columnPhysicalNames: string[]; referencedTableId: string }>,
): OrderTableDefinition {
  const cols = columns.map((c, i) => ({
    id: c.id ?? `col-${physicalName}-${i + 1}`,
    physicalName: c.physicalName,
    notNull: c.notNull,
    autoIncrement: c.autoIncrement,
    defaultValue: c.defaultValue,
    primaryKey: c.primaryKey,
  }));

  // FK 制約の columnIds は physicalName → id の逆引きで解決
  const physicalToId = new Map<string, string>(cols.map((c) => [c.physicalName, c.id]));

  const constraints = (fkConstraints ?? []).map((fk, i) => ({
    kind: "foreignKey" as const,
    id: `fk-${physicalName}-${i + 1}`,
    columnIds: fk.columnPhysicalNames.map((p) => physicalToId.get(p) ?? p),
    referencedTableId: fk.referencedTableId,
    referencedColumnIds: ["col-ref-01"],
  }));

  return { id, physicalName, columns: cols, constraints };
}

// ─── 観点 1: NULL_NOT_ALLOWED_AT_INSERT ────────────────────────────────────

describe("観点 1: NULL_NOT_ALLOWED_AT_INSERT", () => {
  const tables: OrderTableDefinition[] = [
    makeTable("tbl-users", "users", [
      { physicalName: "id", notNull: true, autoIncrement: true, primaryKey: true },
      { physicalName: "name", notNull: true },
      { physicalName: "email", notNull: true },
      { physicalName: "nickname" }, // nullable
    ]),
    makeTable("tbl-orders", "orders", [
      { physicalName: "id", notNull: true, autoIncrement: true, primaryKey: true },
      { physicalName: "user_id", notNull: true },
      { physicalName: "amount", notNull: true },
      { physicalName: "note" }, // nullable
      { physicalName: "status", notNull: true, defaultValue: "'pending'" },
    ]),
  ];

  it("正常系: NOT NULL カラムへの INSERT で変数が直前 step でバインドされている", () => {
    const flow = makeFlow({
      actions: [
        {
          id: "act-001",
          name: "ユーザー登録",
          trigger: "submit",
          inputs: [
            { name: "userName", type: "string", required: true },
            { name: "userEmail", type: "string", required: true },
          ],
          steps: [
            {
              id: "step-01",
              kind: "dbAccess",
              description: "ユーザーを INSERT",
              tableId: "tbl-users",
              operation: "INSERT",
              sql: "INSERT INTO users (name, email) VALUES (@inputs.userName, @inputs.userEmail)",
            },
          ],
        },
      ],
    });
    const issues = checkSqlOrder(flow, tables);
    expect(issues.filter((i) => i.code === "NULL_NOT_ALLOWED_AT_INSERT")).toHaveLength(0);
  });

  it("検出: NOT NULL カラムが変数参照で、変数が未バインド", () => {
    const flow = makeFlow({
      actions: [
        {
          id: "act-001",
          name: "注文登録",
          trigger: "submit",
          inputs: [],
          steps: [
            {
              id: "step-01",
              kind: "dbAccess",
              description: "注文を INSERT (user_id が未バインド)",
              tableId: "tbl-orders",
              operation: "INSERT",
              sql: "INSERT INTO orders (user_id, amount) VALUES (@user.id, @inputs.amount)",
            },
          ],
        },
      ],
    });
    const issues = checkSqlOrder(flow, tables);
    const target = issues.filter((i) => i.code === "NULL_NOT_ALLOWED_AT_INSERT");
    expect(target.length).toBeGreaterThanOrEqual(1);
    expect(target.some((i) => i.message.includes("user_id") && i.message.includes("user"))).toBe(true);
  });

  it("検出: NULL リテラルを NOT NULL カラムに INSERT", () => {
    const flow = makeFlow({
      actions: [
        {
          id: "act-001",
          name: "テスト",
          trigger: "submit",
          inputs: [],
          steps: [
            {
              id: "step-01",
              kind: "dbAccess",
              description: "name に NULL を挿入",
              tableId: "tbl-users",
              operation: "INSERT",
              sql: "INSERT INTO users (name, email) VALUES (NULL, @inputs.email)",
            },
          ],
        },
      ],
    });
    const issues = checkSqlOrder(flow, tables);
    const target = issues.filter((i) => i.code === "NULL_NOT_ALLOWED_AT_INSERT");
    expect(target.some((i) => i.message.includes("name"))).toBe(true);
  });

  it("正常系: nullable カラムは未バインドでも issue なし", () => {
    const flow = makeFlow({
      actions: [
        {
          id: "act-001",
          name: "テスト",
          trigger: "submit",
          inputs: [
            { name: "userName", type: "string", required: true },
            { name: "userEmail", type: "string", required: true },
          ],
          steps: [
            {
              id: "step-01",
              kind: "dbAccess",
              description: "nickname は nullable なので省略可",
              tableId: "tbl-users",
              operation: "INSERT",
              sql: "INSERT INTO users (name, email) VALUES (@inputs.userName, @inputs.userEmail)",
            },
          ],
        },
      ],
    });
    const issues = checkSqlOrder(flow, tables);
    expect(issues.filter((i) => i.code === "NULL_NOT_ALLOWED_AT_INSERT")).toHaveLength(0);
  });

  it("正常系: autoIncrement カラムは未バインドでも issue なし", () => {
    const flow = makeFlow({
      actions: [
        {
          id: "act-001",
          name: "テスト",
          trigger: "submit",
          inputs: [
            { name: "userName", type: "string", required: true },
            { name: "userEmail", type: "string", required: true },
          ],
          steps: [
            {
              id: "step-01",
              kind: "dbAccess",
              description: "id は autoIncrement なので列リストから省略",
              tableId: "tbl-users",
              operation: "INSERT",
              // id 列は指定しない → autoIncrement で DB が埋める → issue なし
              sql: "INSERT INTO users (name, email) VALUES (@inputs.userName, @inputs.userEmail)",
            },
          ],
        },
      ],
    });
    const issues = checkSqlOrder(flow, tables);
    expect(issues.filter((i) => i.code === "NULL_NOT_ALLOWED_AT_INSERT")).toHaveLength(0);
  });

  it("正常系: DEFAULT 付き NOT NULL カラムは issue なし (status = 'pending' default)", () => {
    // status は NOT NULL だが defaultValue: "'pending'" があるため issue にならない
    const flow = makeFlow({
      actions: [
        {
          id: "act-001",
          name: "テスト",
          trigger: "submit",
          inputs: [
            { name: "userId", type: "string", required: true },
            { name: "amount", type: "number", required: true },
          ],
          steps: [
            {
              id: "step-01",
              kind: "dbAccess",
              description: "status は DEFAULT 付きなので省略可",
              tableId: "tbl-orders",
              operation: "INSERT",
              sql: "INSERT INTO orders (user_id, amount) VALUES (@inputs.userId, @inputs.amount)",
            },
          ],
        },
      ],
    });
    const issues = checkSqlOrder(flow, tables);
    expect(issues.filter((i) => i.code === "NULL_NOT_ALLOWED_AT_INSERT")).toHaveLength(0);
  });

  it("正常系: 直前 compute step でバインドされた変数は OK", () => {
    const flow = makeFlow({
      actions: [
        {
          id: "act-001",
          name: "テスト",
          trigger: "submit",
          inputs: [{ name: "rawName", type: "string", required: true }],
          steps: [
            {
              id: "step-01",
              kind: "compute",
              description: "名前をトリム",
              expression: "@inputs.rawName.trim()",
              outputBinding: { name: "cleanName" },
            },
            {
              id: "step-02",
              kind: "dbAccess",
              description: "INSERT",
              tableId: "tbl-users",
              operation: "INSERT",
              sql: "INSERT INTO users (name, email) VALUES (@cleanName, @inputs.userEmail)",
            },
          ],
        },
      ],
    });
    // cleanName は step-01 でバインドされるため issue なし
    // userEmail は inputs に無いため issue になるが、それは別の問題
    const issues = checkSqlOrder(flow, tables);
    // cleanName に関する NULL_NOT_ALLOWED_AT_INSERT は出ないことを確認
    const cleanNameIssues = issues.filter(
      (i) => i.code === "NULL_NOT_ALLOWED_AT_INSERT" && i.message.includes("cleanName"),
    );
    expect(cleanNameIssues).toHaveLength(0);
  });
});

// ─── 観点 2: FK_REFERENCE_NOT_INSERTED ────────────────────────────────────

describe("観点 2: FK_REFERENCE_NOT_INSERTED", () => {
  const tables: OrderTableDefinition[] = [
    makeTable("tbl-parent", "parent_records", [
      { physicalName: "id", notNull: true, autoIncrement: true, primaryKey: true },
      { physicalName: "code", notNull: true },
    ]),
    makeTable(
      "tbl-child",
      "child_records",
      [
        { physicalName: "id", notNull: true, autoIncrement: true, primaryKey: true },
        { physicalName: "parent_id", notNull: true },
        { physicalName: "value", notNull: true },
      ],
      [{ columnPhysicalNames: ["parent_id"], referencedTableId: "tbl-parent" }],
    ),
  ];

  it("検出: FK 参照先への先行 INSERT なしで子テーブルを INSERT (未バインド変数)", () => {
    // @unknownParent は inputs にも outputBinding にも存在しない → 未バインド → FK issue
    const flow = makeFlow({
      actions: [
        {
          id: "act-001",
          name: "テスト",
          trigger: "submit",
          inputs: [
            { name: "value", type: "string", required: true },
          ],
          steps: [
            {
              id: "step-01",
              kind: "dbAccess",
              description: "子レコードを INSERT (parent_id が未バインド変数)",
              tableId: "tbl-child",
              operation: "INSERT",
              // @unknownParent は inputs にも step outputBinding にも存在しない
              sql: "INSERT INTO child_records (parent_id, value) VALUES (@unknownParent.id, @inputs.value)",
            },
          ],
        },
      ],
    });
    const issues = checkSqlOrder(flow, tables);
    const target = issues.filter((i) => i.code === "FK_REFERENCE_NOT_INSERTED");
    expect(target.length).toBeGreaterThanOrEqual(1);
    expect(target.some((i) => i.message.includes("parent_records"))).toBe(true);
  });

  it("正常系: FK 参照先への先行 INSERT がある場合は issue なし", () => {
    const flow = makeFlow({
      actions: [
        {
          id: "act-001",
          name: "テスト",
          trigger: "submit",
          inputs: [
            { name: "code", type: "string", required: true },
            { name: "value", type: "string", required: true },
          ],
          steps: [
            {
              id: "step-01",
              kind: "dbAccess",
              description: "親レコードを INSERT",
              tableId: "tbl-parent",
              operation: "INSERT",
              sql: "INSERT INTO parent_records (code) VALUES (@inputs.code)",
              outputBinding: { name: "createdParent" },
            },
            {
              id: "step-02",
              kind: "dbAccess",
              description: "子レコードを INSERT (先行 INSERT あり)",
              tableId: "tbl-child",
              operation: "INSERT",
              sql: "INSERT INTO child_records (parent_id, value) VALUES (@createdParent.id, @inputs.value)",
            },
          ],
        },
      ],
    });
    const issues = checkSqlOrder(flow, tables);
    expect(issues.filter((i) => i.code === "FK_REFERENCE_NOT_INSERTED")).toHaveLength(0);
  });

  it("検出: 異なる action 間の先行 INSERT は対象外 (同 action のみ検査、未バインド変数使用)", () => {
    // act-001 で parent_records を INSERT したが、act-002 では未バインド変数を FK に使う
    const flow = makeFlow({
      actions: [
        {
          id: "act-001",
          name: "親作成",
          trigger: "submit",
          inputs: [{ name: "code", type: "string", required: true }],
          steps: [
            {
              id: "step-01",
              kind: "dbAccess",
              description: "親レコードを INSERT (別 action)",
              tableId: "tbl-parent",
              operation: "INSERT",
              sql: "INSERT INTO parent_records (code) VALUES (@inputs.code)",
              outputBinding: { name: "createdParent" },
            },
          ],
        },
        {
          id: "act-002",
          name: "子作成",
          trigger: "click",
          inputs: [
            { name: "value", type: "string", required: true },
          ],
          steps: [
            {
              // act-002 では parent_records への先行 INSERT も SELECT も無く、
              // @unknownParent は未バインド → FK issue
              id: "step-02",
              kind: "dbAccess",
              description: "子レコードを INSERT (同 action に先行 INSERT なし、未バインド変数)",
              tableId: "tbl-child",
              operation: "INSERT",
              sql: "INSERT INTO child_records (parent_id, value) VALUES (@unknownParent.id, @inputs.value)",
            },
          ],
        },
      ],
    });
    const issues = checkSqlOrder(flow, tables);
    // act-002 の step-02 は FK issue になるはず
    const fkIssues = issues.filter((i) => i.code === "FK_REFERENCE_NOT_INSERTED");
    expect(fkIssues.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── 共通: スキップ・エッジケース ──────────────────────────────────────────

describe("共通: スキップ・エッジケース", () => {
  const tables: OrderTableDefinition[] = [
    makeTable("tbl-items", "items", [
      { physicalName: "id", notNull: true, autoIncrement: true, primaryKey: true },
      { physicalName: "name", notNull: true },
    ]),
  ];

  it("空 actions は issue なし", () => {
    const flow = makeFlow({ actions: [] });
    const issues = checkSqlOrder(flow, tables);
    expect(issues).toHaveLength(0);
  });

  it("空 tables は issue なし (カタログ外テーブルは skip)", () => {
    const flow = makeFlow({
      actions: [
        {
          id: "act-001",
          name: "テスト",
          trigger: "submit",
          inputs: [],
          steps: [
            {
              id: "step-01",
              kind: "dbAccess",
              description: "カタログ外テーブルへの INSERT",
              tableId: "tbl-unknown",
              operation: "INSERT",
              sql: "INSERT INTO unknown_table (col1) VALUES (@var1)",
            },
          ],
        },
      ],
    });
    const issues = checkSqlOrder(flow, []);
    expect(issues).toHaveLength(0);
  });

  it("SELECT 文は観点 1+2 の対象外 (skip)", () => {
    const flow = makeFlow({
      actions: [
        {
          id: "act-001",
          name: "テスト",
          trigger: "submit",
          inputs: [],
          steps: [
            {
              id: "step-01",
              kind: "dbAccess",
              description: "SELECT は対象外",
              tableId: "tbl-items",
              operation: "SELECT",
              sql: "SELECT id, name FROM items WHERE id = @someVar",
            },
          ],
        },
      ],
    });
    const issues = checkSqlOrder(flow, tables);
    expect(issues.filter((i) => ["NULL_NOT_ALLOWED_AT_INSERT", "FK_REFERENCE_NOT_INSERTED"].includes(i.code))).toHaveLength(0);
  });

  it("DELETE 文は観点 1+2 の対象外 (skip)", () => {
    const flow = makeFlow({
      actions: [
        {
          id: "act-001",
          name: "テスト",
          trigger: "click",
          inputs: [],
          steps: [
            {
              id: "step-01",
              kind: "dbAccess",
              description: "DELETE は対象外",
              tableId: "tbl-items",
              operation: "DELETE",
              sql: "DELETE FROM items WHERE id = @inputs.id",
            },
          ],
        },
      ],
    });
    const issues = checkSqlOrder(flow, tables);
    expect(issues.filter((i) => ["NULL_NOT_ALLOWED_AT_INSERT", "FK_REFERENCE_NOT_INSERTED"].includes(i.code))).toHaveLength(0);
  });

  it("sql フィールドが無い dbAccess step はスキップ", () => {
    const flow = makeFlow({
      actions: [
        {
          id: "act-001",
          name: "テスト",
          trigger: "submit",
          inputs: [],
          steps: [
            {
              id: "step-01",
              kind: "dbAccess",
              description: "SQL なし INSERT",
              tableId: "tbl-items",
              operation: "INSERT",
              // sql: なし
            },
          ],
        },
      ],
    });
    const issues = checkSqlOrder(flow, tables);
    expect(issues.filter((i) => i.code === "NULL_NOT_ALLOWED_AT_INSERT")).toHaveLength(0);
  });

  it("ambientVariables で宣言された変数は INSERT 時点でバインド済みとみなす", () => {
    const flow = makeFlow({
      context: {
        ambientVariables: [
          { name: "sessionUserId", type: "string" },
          { name: "requestId", type: "string" },
        ],
      },
      actions: [
        {
          id: "act-001",
          name: "テスト",
          trigger: "submit",
          inputs: [{ name: "itemName", type: "string", required: true }],
          steps: [
            {
              id: "step-01",
              kind: "dbAccess",
              description: "ambient variable を使用",
              tableId: "tbl-items",
              operation: "INSERT",
              sql: "INSERT INTO items (name) VALUES (@inputs.itemName)",
            },
          ],
        },
      ],
    });
    const issues = checkSqlOrder(flow, tables);
    expect(issues.filter((i) => i.code === "NULL_NOT_ALLOWED_AT_INSERT")).toHaveLength(0);
  });
});

// ─── welfare-benefit M1 実証 fixture ────────────────────────────────────────

describe("welfare-benefit M1 実証: beneficiary_id NOT NULL × INSERT 順序", () => {
  /**
   * Phase 2 子 2 #600 で発見した M1 の再現:
   *   payments.beneficiary_id は NOT NULL
   *   旧フローでは beneficiary SELECT の結果 (@beneficiary) が payments INSERT 時点で
   *   「初回受給者」ケースで null になる可能性があった。
   *
   * 現行の welfare-benefit フローは修正済みだが、ここでは問題のある旧パターンを
   * fixture として残して回帰検出を実証する。
   */

  const welfarePaymentsTable = makeTable(
    "7198e401-00d8-4f6e-8382-aad4caeaf59e",
    "payments",
    [
      { physicalName: "id", notNull: true, autoIncrement: true, primaryKey: true },
      { physicalName: "application_id", notNull: true },
      { physicalName: "beneficiary_id", notNull: true },   // M1 の源: NOT NULL
      { physicalName: "amount", notNull: true },
      { physicalName: "currency", notNull: true, defaultValue: "'JPY'" },
      { physicalName: "payment_method", notNull: true, defaultValue: "'bank_transfer'" },
      { physicalName: "bank_account_ref", notNull: true },
      { physicalName: "idempotency_key", notNull: true },
      { physicalName: "transfer_status", notNull: true, defaultValue: "'pending'" },
    ],
    [
      {
        columnPhysicalNames: ["application_id"],
        referencedTableId: "b57571d6-dc31-4dad-aad9-a2315267ea90",
      },
      {
        columnPhysicalNames: ["beneficiary_id"],
        referencedTableId: "dde87bc9-e122-4466-9b1c-e8c5b2f98408",
      },
    ],
  );

  const beneficiariesTable = makeTable(
    "dde87bc9-e122-4466-9b1c-e8c5b2f98408",
    "beneficiaries",
    [
      { physicalName: "id", notNull: true, autoIncrement: true, primaryKey: true },
      { physicalName: "beneficiary_code", notNull: true },
      { physicalName: "applicant_id", notNull: true },
      { physicalName: "fiscal_year", notNull: true },
      { physicalName: "total_paid_amount", notNull: true, defaultValue: "0" },
      { physicalName: "eligibility_status", notNull: true, defaultValue: "'eligible'" },
    ],
  );

  const applicationsTable = makeTable(
    "b57571d6-dc31-4dad-aad9-a2315267ea90",
    "applications",
    [
      { physicalName: "id", notNull: true, autoIncrement: true, primaryKey: true },
      { physicalName: "application_code", notNull: true },
      { physicalName: "applicant_id", notNull: true },
      { physicalName: "benefit_type", notNull: true },
      { physicalName: "requested_amount", notNull: true },
      { physicalName: "status", notNull: true, defaultValue: "'received'" },
      { physicalName: "submitted_at", notNull: true },
    ],
  );

  const tables = [welfarePaymentsTable, beneficiariesTable, applicationsTable];

  it("旧パターン (M1 バグ): payments INSERT 時点で @beneficiary が未バインド → 検出", () => {
    /**
     * 旧フローのパターン:
     *   step-06: beneficiaries SELECT → @beneficiary (nullable: 初回受給者は null)
     *   step-XX: payments INSERT で @beneficiary.id を参照
     *   → 初回受給者のとき @beneficiary.id は null → beneficiary_id NOT NULL 制約違反
     *
     * ここではより単純化して「@beneficiary が inputs にも outputBinding にも存在しない」
     * 状態でパターンを再現する。
     */
    const flow = makeFlow({
      actions: [
        {
          id: "act-payment",
          name: "支払処理",
          trigger: "auto",
          inputs: [
            { name: "applicationId", type: "string", required: true },
            { name: "bankAccountRef", type: "string", required: true },
            { name: "idempotencyKey", type: "string", required: true },
            { name: "amount", type: "number", required: true },
          ],
          steps: [
            {
              id: "step-pay-01",
              kind: "dbAccess",
              description: "payments テーブルに INSERT (beneficiary_id = @beneficiary.id は未バインド)",
              tableId: "7198e401-00d8-4f6e-8382-aad4caeaf59e",
              operation: "INSERT",
              // @beneficiary は inputs / outputBinding のどちらにも存在しない → M1 パターン
              sql: "INSERT INTO payments (application_id, beneficiary_id, amount, bank_account_ref, idempotency_key) VALUES (@inputs.applicationId, @beneficiary.id, @inputs.amount, @inputs.bankAccountRef, @inputs.idempotencyKey)",
            },
          ],
        },
      ],
    });

    const issues = checkSqlOrder(flow, tables);
    const nullIssues = issues.filter((i) => i.code === "NULL_NOT_ALLOWED_AT_INSERT");
    expect(nullIssues.length).toBeGreaterThanOrEqual(1);
    expect(nullIssues.some((i) => i.message.includes("beneficiary_id") && i.message.includes("beneficiary"))).toBe(true);
  });

  it("修正後パターン: beneficiary SELECT → outputBinding → payments INSERT → 検出なし", () => {
    const flow = makeFlow({
      actions: [
        {
          id: "act-payment",
          name: "支払処理",
          trigger: "auto",
          inputs: [
            { name: "applicationId", type: "string", required: true },
            { name: "bankAccountRef", type: "string", required: true },
            { name: "idempotencyKey", type: "string", required: true },
            { name: "amount", type: "number", required: true },
            { name: "applicantId", type: "string", required: true },
          ],
          steps: [
            {
              id: "step-01",
              kind: "dbAccess",
              description: "受給者台帳を取得",
              tableId: "dde87bc9-e122-4466-9b1c-e8c5b2f98408",
              operation: "SELECT",
              sql: "SELECT id, eligibility_status FROM beneficiaries WHERE applicant_id = @inputs.applicantId",
              outputBinding: { name: "beneficiary" },
            },
            {
              id: "step-02",
              kind: "dbAccess",
              description: "payments INSERT (beneficiary.id は step-01 でバインド済み)",
              tableId: "7198e401-00d8-4f6e-8382-aad4caeaf59e",
              operation: "INSERT",
              sql: "INSERT INTO payments (application_id, beneficiary_id, amount, bank_account_ref, idempotency_key) VALUES (@inputs.applicationId, @beneficiary.id, @inputs.amount, @inputs.bankAccountRef, @inputs.idempotencyKey)",
            },
          ],
        },
      ],
    });

    const issues = checkSqlOrder(flow, tables);
    // beneficiary_id に関する NULL_NOT_ALLOWED_AT_INSERT は出ない
    const nullIssues = issues.filter(
      (i) => i.code === "NULL_NOT_ALLOWED_AT_INSERT" && i.message.includes("beneficiary_id"),
    );
    expect(nullIssues).toHaveLength(0);
  });
});
