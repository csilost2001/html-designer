# docs/sample-project/extensions/logistics

物流業 (配送指示 → 倉庫ピッキング → 配送追跡 → 顧客到着確認) 向けの ProcessFlow 拡張定義サンプルです。

実行時にバリデーターが読む場所は `data/extensions/` です。このディレクトリには、仕様確認用・業務別テンプレート用のサンプルを配置します。

## 対象ユースケース

- 配送指示受付 → 在庫引当 (排他ロック)
- 倉庫ピッキング (モバイル作業者操作)
- 運送会社コールバック受信 → 配送追跡 UPSERT
- 顧客到着確認 → 状態遷移 IN_TRANSIT → DELIVERED
- 配送失敗時の再配達 / 廃棄判断 (補償処理)

## ファイル一覧

| ファイル | 内容 |
|---|---|
| `field-types.json` | 配送指示 ID / 追跡番号 / 倉庫ロケーション / 配送ステータスの FieldType 拡張 |
| `triggers.json` | 運送会社からの配送試行通知トリガー (`deliveryAttempted`) |
| `db-operations.json` | 在庫排他ロック (`LOCK_INVENTORY`) の DbOperation 拡張 |
| `steps.json` | 倉庫ピッキング / 配送追跡更新 / 配送完了確認の Step 拡張 |

## 適用方法

業務プロジェクトで利用する場合は、必要なファイルを手動で `data/extensions/` にコピー:

```bash
cp docs/sample-project/extensions/logistics/*.json data/extensions/
```

## 拡張の概要

### Step 拡張

- **PickingStep**: 倉庫作業者がモバイルから走査した商品 ID リストを取り込み、ピッキング作業の完了を検証する
- **TrackingUpdateStep**: 運送会社の位置情報更新コールバックを `tracking_events` に冪等記録 (UPSERT_IDEMPOTENT 併用) し、`shipment_orders` の現在ステータスを反映する
- **DeliveryConfirmStep**: 受領サイン / 写真 / 不在票のいずれかで顧客到着確認を `delivery_confirmations` に記録し、`shipment_orders` を `DELIVERED` に確定する

### DbOperation 拡張

- **LOCK_INVENTORY**: `parts_inventory` テーブルに対する `SELECT ... FOR UPDATE` 排他ロック。配送指示登録時に在庫数を確保するための pessimistic ロック方針

### Trigger 拡張

- **deliveryAttempted**: 運送会社の配送試行イベント (DELIVERED / FAILED / RETURNED 等) を受信した時の起動契機

### FieldType 拡張

- **shipmentId / trackingNumber / warehouseLocation / deliveryStatus**: 物流業務固有の値型カテゴリ

## 由来 ISSUE

| ISSUE / PR | 担当 AI | 拡張定義 |
|---|---|---|
| #486 / PR #487 (Sonnet) | Sonnet | logistics namespace 初期定義 + 配送指示/ピッキング/追跡/到着確認サンプル |
| #486 / PR #488 (Opus) | Opus | 同 namespace の schema 詳細化 (deliveryStatus enum 強化、PickingStep/DeliveryConfirmStep schema 拡充)、別実装サンプル |

`/create-flow` スキル (PR #485) の効果検証を兼ねて Sonnet と Opus の並列実装で品質比較を行った検証データ。

## 実利用サンプル

- `docs/sample-project/process-flows/ffffffff-0001-4000-8000-ffffffffffff.json` (Sonnet 実装、PR #487)
- `docs/sample-project/process-flows/ffffffff-0002-4000-8000-ffffffffffff.json` (Opus 実装、PR #488)

両方とも logistics 拡張 (field-types / triggers / db-operations / steps) を実体使用 (spec §15.3 遵守)。

## 注意

- `type: "logistics:PickingStep"` 形式は process-flow.schema.json が現状未対応 (#480/PR #482 で実証)。実フロー側では `type: "other"` + `outputSchema` + `note: "extensionStep=logistics:..."` 注記パターンを使う。schema が namespaced step 型に対応した時点で移行する想定。
