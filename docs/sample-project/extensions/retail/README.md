# retail namespace — 小売業拡張定義

業界 namespace `retail` の拡張定義。店舗在庫照会・カート追加・注文確定・配送指示の 4 シナリオで使用する。

## ファイル一覧

| ファイル | 内容 |
|---|---|
| `field-types.json` | `productCode` / `cartId` / `orderId` / `shipmentTrackingNumber` など小売業固有の型 |
| `steps.json` | `CartManageStep` / `OrderConfirmStep` / `InventoryReserveStep` / `ShipmentDispatchStep` の 4 カスタムステップ |
| `triggers.json` | `orderConfirmed` (注文確定後の配送指示起動) / `inventoryLow` (在庫低下アラート) |
| `db-operations.json` | `UPSERT_CART_ITEM` / `DECREMENT_INVENTORY` のカスタム DB 操作 |

## 利用フロー

- `gggggggg-0001-*` 店舗在庫照会: `productCode` / `storeCode` fieldType 使用
- `gggggggg-0002-*` カート追加: `CartManageStep` / `cartId` / `UPSERT_CART_ITEM` 使用
- `gggggggg-0003-*` 注文確定: `OrderConfirmStep` / `InventoryReserveStep` / `orderId` / `DECREMENT_INVENTORY` 使用
- `gggggggg-0004-*` 配送指示: `ShipmentDispatchStep` / `shipmentTrackingNumber` 使用、`orderConfirmed` trigger で起動
