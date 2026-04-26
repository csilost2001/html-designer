# logistics 拡張 namespace

物流業 (倉庫/配送/追跡) 業務向け ProcessFlow 拡張定義。

## 対象ユースケース

- 配送指示受付 → 在庫引当 (排他ロック)
- 倉庫ピッキング (モバイル作業者操作)
- 運送会社コールバック受信 → 配送追跡 UPSERT
- 顧客到着確認 → 状態遷移 IN_TRANSIT → DELIVERED
- 配送失敗時の再配達/廃棄判断 (補償処理)

## ファイル構成

| ファイル | 内容 |
|---|---|
| `field-types.json` | `shipmentId` / `trackingNumber` / `warehouseLocation` / `deliveryStatus` |
| `triggers.json` | `deliveryAttempted` — 運送会社コールバック起動トリガー |
| `db-operations.json` | `LOCK_INVENTORY` — 排他ロック付き在庫引当 |
| `steps.json` | `PickingStep` / `TrackingUpdateStep` / `DeliveryConfirmStep` |

## 使用サンプル

`docs/sample-project/process-flows/ffffffff-0001-4000-8000-ffffffffffff.json`
— 配送指示/ピッキング/追跡/到着確認 (物流) シナリオ
