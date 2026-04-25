# ProcessFlow Tier C 仕様

関連 issue: #426

本仕様は処理フロー JSON Schema の Tier C 拡張を定義する。一次成果物は `schemas/process-flow.schema.json` であり、TypeScript 型と UI 表示定義は派生物として追従する。

## C-1 ExternalSystemStep の耐障害性設定

`ExternalSystemStep` は外部システム呼び出し単位で circuit breaker と bulkhead を任意指定できる。

```json
{
  "type": "externalSystem",
  "circuitBreaker": {
    "failureThreshold": 5,
    "timeout": 60000,
    "halfOpenMaxCalls": 2
  },
  "bulkhead": {
    "maxConcurrent": 4,
    "maxWait": 3000
  }
}
```

`circuitBreaker.failureThreshold` と `circuitBreaker.timeout` は必須。`halfOpenMaxCalls` は half-open 時に許可する試行数を表す。

`bulkhead.maxConcurrent` は必須。`maxWait` は同時実行枠が空くまで待つ最大時間を表す。

## C-2 ClosingStep

`ClosingStep` は日次・月次・四半期・年次などの締め処理境界を表す。

```json
{
  "id": "step-close",
  "type": "closing",
  "description": "月次在庫締めを確定する",
  "period": "monthly",
  "cutoffAt": "23:59:59",
  "idempotencyKey": "inventory-close-@targetMonth",
  "rollbackOnFailure": true
}
```

`period` は `daily` / `monthly` / `quarterly` / `yearly` / `custom` のいずれか。`custom` を使う場合は `customCron` でスケジュール式を補足できる。

## C-3 CdcStep

`CdcStep` は対象テーブルの変更捕捉と、その出力先を宣言する。

```json
{
  "id": "step-cdc",
  "type": "cdc",
  "description": "在庫締め結果の変更履歴を監査ログへ送る",
  "tables": ["inventory_closing_results"],
  "captureMode": "incremental",
  "destination": {
    "type": "auditLog",
    "target": "inventory.monthlyClose"
  },
  "includeColumns": ["item_id", "closing_month", "closing_quantity"]
}
```

`tables`、`captureMode`、`destination` は必須。`destination.type` は `auditLog` / `eventStream` / `table` のいずれか。

## C-4 Health / Readiness

`ProcessFlow` 直下に `health` と `readiness` を任意で定義できる。

```json
{
  "health": {
    "checks": [
      { "name": "inventory-db", "type": "db", "target": "inventory" }
    ]
  },
  "readiness": {
    "checks": [
      { "name": "warehouse-api", "type": "http", "target": "https://warehouse.example.com/health" }
    ],
    "minimumPassCount": 1
  }
}
```

`HealthCheck.type` は `db` / `http` / `custom` のいずれか。`readiness.minimumPassCount` は readiness 判定に必要な成功数を表す。

## C-5 ResourceRequirements

`ProcessFlow` 直下に `resources` を任意で定義できる。

```json
{
  "resources": {
    "cpu": { "request": "500m", "limit": "1" },
    "memory": { "request": "512Mi", "limit": "1Gi" },
    "dbConnections": 8,
    "timeout": 900000
  }
}
```

`resources` は実装時の実行基盤向け目安であり、既存フローに対して後方互換の optional フィールドとして扱う。
