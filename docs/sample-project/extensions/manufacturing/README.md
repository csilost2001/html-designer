# docs/sample-project/extensions/manufacturing

製造業 (受注 → 生産計画 → 部材引当 → 製造実績 → 品質検査 → 出荷) 向けの ProcessFlow 拡張定義サンプルです。

実行時にバリデーターが読む場所は `data/extensions/` です。このディレクトリには、仕様確認用・業務別テンプレート用のサンプルを配置します。

## ファイル一覧

| ファイル | 内容 |
|---|---|
| `field-types.json` | ロット ID / 製造指示書 ID / 部品番号 / シリアル番号の FieldType 拡張 |
| `triggers.json` | 品質異常検知トリガー (`qualityIncident`) |
| `db-operations.json` | BOM 展開 / 在庫引当の DbOperation 拡張 |
| `steps.json` | BOM 展開 / 在庫引当 / トレーサビリティ記録 / 品質検査の Step 拡張 |

## 適用方法

業務プロジェクトで利用する場合は、必要なファイルを手動で `data/extensions/` にコピーしてください。

```bash
cp docs/sample-project/extensions/manufacturing/*.json data/extensions/
```

## 拡張の概要

### Step 拡張

- **BomExplodeStep**: 製品コード (`productCode`) と数量 (`quantity`) を受け取り、BOM (Bill of Materials) に基づいて必要部品リストを階層展開する
- **InventoryReserveStep**: 部品番号と数量を受け取り、parts_inventory に排他ロック付きで在庫引当を行う (`RESERVE_INVENTORY` DbOp と組合わせ)
- **TraceabilityStep**: 部材ロット / 製造工程 / 担当者を traceability_log に記録する
- **QualityCheckStep**: ロットの品質仕様適合チェック

### DbOperation 拡張

- **BOM_EXPLODE**: BOM 階層展開 (再帰 SQL)
- **RESERVE_INVENTORY**: 排他ロック付き UPDATE での在庫引当

### Trigger 拡張

- **qualityIncident**: 品質異常検知時の起動 (将来用候補、現状未使用)

## 由来 ISSUE

| ISSUE / PR | 追加された拡張 |
|---|---|
| #479 / PR #481 (シナリオ #1) | `lotId` / `workOrderId` / `partNumber` fieldType、`BOM_EXPLODE` / `RESERVE_INVENTORY` DbOperation、`BomExplodeStep` / `InventoryReserveStep` |
| #480 / PR #482 (シナリオ #2) | `serialNumber` fieldType、`qualityIncident` trigger、`TraceabilityStep` / `QualityCheckStep` |

## 実利用サンプル

- `docs/sample-project/process-flows/eeeeeeee-0001-*.json` (シナリオ #1): 受注/生産計画 ですべての #479 拡張を実体使用
- `docs/sample-project/process-flows/eeeeeeee-0002-*.json` (シナリオ #2): 製造実績/品質/出荷 で TraceabilityStep / QualityCheckStep / serialNumber を実体使用 (`type: "other"` + outputSchema パターン)
