# docs/sample-project/extensions/securities

証券注文・約定領域向けの ProcessFlow 拡張定義サンプルです。

実行時にバリデーターが読む場所は `data/extensions/` です。このディレクトリには、仕様確認用・業務別テンプレート用のサンプルを配置します。

## ファイル一覧

| ファイル | 内容 |
|---|---|
| `field-types.json` | 注文 ID、口座 ID、約定 ID、銘柄コードの FieldType 拡張サンプル |
| `triggers.json` | 市場開場・市場閉場トリガーの拡張サンプル |
| `db-operations.json` | 冪等 UPSERT 操作の拡張サンプル |
| `steps.json` | 約定照合ステップの拡張サンプル |

## 適用方法

業務プロジェクトで利用する場合は、必要なファイルを手動で `data/extensions/` にコピーしてください。

```bash
cp docs/sample-project/extensions/securities/*.json data/extensions/
```

## 将来用候補

- `TradeMatchStep`: 約定照合を専用ステップ化する候補。現行サンプルフロー本体では未使用。
- 拡張 FieldType (`orderId` / `accountId` / `tradeId` / `securityCode`): ドメイン固有型として利用する候補。現行サンプルフロー本体では未使用。
