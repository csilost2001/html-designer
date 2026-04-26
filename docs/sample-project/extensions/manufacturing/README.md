# docs/sample-project/extensions/manufacturing

製造業向け受注/生産計画/部材引当/製造指示領域の ProcessFlow 拡張定義サンプルです。

実行時にバリデーターが読む場所は `data/extensions/` です。このディレクトリには、仕様確認用・業務別テンプレート用のサンプルを配置します。

## ファイル一覧

| ファイル | 内容 |
|---|---|
| `field-types.json` | ロット ID、製造指示書 ID、部品番号の FieldType 拡張サンプル |
| `db-operations.json` | BOM 階層展開・在庫引当 (排他ロック) の DbOperation 拡張サンプル |
| `steps.json` | BOM 展開ステップ・在庫引当ステップの拡張サンプル |

## 適用方法

業務プロジェクトで利用する場合は、必要なファイルを手動で `data/extensions/` にコピーしてください。

```bash
cp docs/sample-project/extensions/manufacturing/*.json data/extensions/
```

## 拡張の概要

### BomExplodeStep

製品コード (`productCode`) と数量 (`quantity`) を受け取り、BOM (Bill of Materials) 定義に基づいて必要部品リストを階層的に展開する。出力は部品番号と必要数量のリスト。

フロー内での参照形式: `"type": "manufacturing:BomExplodeStep"`

### InventoryReserveStep

部品番号 (`partNumber`) と数量 (`quantity`) を受け取り、parts_inventory テーブルに対して排他ロック付きで在庫引当を行う。`RESERVE_INVENTORY` DbOperation と組み合わせて使用する。

フロー内での参照形式: `"type": "manufacturing:InventoryReserveStep"`

### BOM_EXPLODE / RESERVE_INVENTORY

DbOperation 拡張。フロー内の `dbAccess` step の `operation` フィールドで使用する。

## 実利用サンプル

`docs/sample-project/process-flows/eeeeeeee-0001-4000-8000-eeeeeeeeeeee.json` にて全拡張を実体使用しています。
