# サンプルプロジェクト構造 (v3)

## 位置づけ

`docs/sample-project-v3/` 以下の各サブディレクトリは、**designer で作成する業務アプリ設計成果物の独立したサンプル単位**。フレームワーク本体のデバッグ・テスト・動作確認・ドッグフード検証を多様なシナリオで行うために配置されている。

ディレクトリ命名 (`healthcare` / `finance` / `manufacturing` / `welfare-benefit` / `public-service` / `retail` / `logistics` 等) は **シナリオ題材を簡易表現したもの** に過ぎず、フレームワーク側に「業界」という概念は存在しない。各サブディレクトリは「1 つの完結した業務アプリ」として独立しており、相互に成果物を共有しない。

## 基本原則: プロジェクト = 完結した成果物セット

designer の実運用は **1 プロジェクト = 1 業務アプリ** 単位。
- designer の規約カタログ画面 (`/conventions/catalog`) は 1 プロジェクトに 1 つの規約カタログを `data/conventions/catalog.json` として永続化
- テーブル / 処理フロー / 拡張 / 画面 等もすべてプロジェクト単位

サンプルもこの実運用を模す。各サンプルプロジェクト (= サブディレクトリ) は以下の成果物を **個別に・完結して** 持つ。プロジェクト間で成果物を共有 (= サンプル特有の横断配置) してはならない。

## プロジェクトに含まれる成果物

各サンプルプロジェクト (`docs/sample-project-v3/<project>/`) のレイアウト:

### 必須

| ファイル / ディレクトリ | schema | 役割 |
|---|---|---|
| `project.json` | `project.v3.schema.json` | プロジェクトメタデータ (ID / 名称 / 説明 / 成熟度 / 作成日 / 更新日) |
| `tables/*.json` | `table.v3.schema.json` | テーブル定義群 |
| `process-flows/*.json` | `process-flow.v3.schema.json` | 処理フロー群 (API エンドポイント / バッチ等) |
| `extensions/<namespace>.v3.json` | `extensions.v3.schema.json` | 拡張定義 (namespace 単位、当プロジェクト固有の業務 enum / 型 / レスポンス等) |
| `conventions-catalog.v3.json` | `conventions.v3.schema.json` | 規約カタログ (`@conv.*` で参照される横断ルール: 役割 / 制限値 / 通貨 / 採番 / メッセージ / 正規表現 等) |

### 任意 (シナリオで必要に応じて)

| ファイル / ディレクトリ | schema | 役割 |
|---|---|---|
| `screens/*.json` | `screen.v3.schema.json` | 画面 (画面項目定義 `items[]` を内包) |
| `screen-layouts/*.json` | `screen-layout.v3.schema.json` | 画面レイアウト |
| `views/*.json` | `view.v3.schema.json` | 画面フロー / 一覧定義 |
| `er-layout.json` | `er-layout.v3.schema.json` | ER 図レイアウト |
| `sequences/*.json` | `sequence.v3.schema.json` | シーケンス図 |
| `custom-blocks.json` | `custom-block.v3.schema.json` | カスタムブロック |

### ❌ 廃止された配置 (Phase 4-β migration 後)

| 旧配置 | 状態 | 移行先 |
|---|---|---|
| `screen-items/<screenId>.json` | Phase 4-β で廃止 (#712) | `screens/<screenId>.json` の `items[]` に embed |

runtime (`designer-mcp`) は `screen-items/` ディレクトリを読まず、新規 workspace 作成時にも生成しない。サンプル / data ディレクトリにこの配置で残っているファイルは無視される (validator: `runtimeContractValidator [LEGACY_SCREEN_ITEMS_DIR]`)。

## 反パターン

### ❌ プロジェクト横断の単一ファイル配置

`docs/sample-project-v3/conventions-catalog.v3.json` のようにトップレベル単一ファイルで複数サンプルプロジェクト共通とするのは **禁止**。理由:

- designer の実運用 (1 プロジェクト 1 規約カタログ) と整合しない
- サンプルは実運用を模すべきで、サンプル特有の構造を持つと設計検証が破綻する
- 業務アプリ A が業務アプリ B の規約に依存することは普通あり得ない

これは規約カタログだけでなく、全リソース (project / tables / process-flows / extensions 等) に適用される原則。

### ❌ 「業界」という概念をフレームワークに持ち込む

サブディレクトリ名 (`healthcare` / `finance`) は **題材** であって **意味のある分類** ではない。validator / loader / schema / UI が「業界」を判定材料にすることは禁止。任意のサンプル名 (例: `sample-a` / `sample-b` / `demo-1`) でも動作する設計でなければならない。

ドキュメント・コミットメッセージ・コメント等で「業界別」「業界横断」と表現するのも避ける。「サンプルプロジェクト別」「プロジェクト横断 (反パターン)」と書く。

### ❌ プロジェクトの一部リソース欠落を許容する

「ある業務アプリのサンプルだから規約は要らない」のような判断はしない。実運用では業務アプリは必ず規約カタログを持つので、サンプルにも必ず存在する。最小有効インスタンス (`{ "version": "1.0.0" }` のみで各カテゴリ未定義) でも良いので、ファイル自体は配置する。

## design.json の preview-only マーキング規約 (#763)

### 背景・目的

`screens/<id>.design.json` (GrapesJS 出力 HTML) には、見栄え確認のためのハードコードサンプル行が含まれることがある。AI がコンポーネントを生成する際、これが「preview ダミーで実 API 呼びに置き換える」のか「実データ初期値」なのかを判別する根拠が必要。本規約はその判別基準を定める。

### 規約本体

**属性**: HTML 要素に `data-preview-only="true"` を付与する。

**意味**: 「この DOM 要素配下の中身は、AI コード生成時に実 API 呼び結果で置換される placeholder」と解釈する。

**適用対象例**:

| 適用例 | 説明 |
|---|---|
| `<tbody data-item-id="xxx" data-preview-only="true">` | 一覧 viewer の hardcoded `<tr>` 行 (実データ一覧で置換) |
| `<select data-preview-only="true">` | 動的 options bind 時の hardcoded `<option>` (API 取得オプションで置換) |
| `<div data-preview-only="true">` | フロー出力で書き換わる文言を包む表示専用領域 |

**`direction: "viewer"` の screen-item との関係**: viewer screen-item を持つ画面では、対応する viewer DOM (`data-item-id="<viewerId>"`) 配下に `data-preview-only` を入れることで「この一覧は実データで置換される、表示行は preview のみ」と明示できる。

### AI コード生成器の解釈ルール

- `data-preview-only="true"` が付いた要素 → 子要素の中身は無視し、要素自体を対応する screen-item の binding で置換実装する
- 親要素に `data-item-id="<id>"` がある場合、対応する screen-item の `valueFrom: flowVariable` 等に従って実装する
- `data-preview-only` は **伝播しない** (親に付いていれば子要素全体が preview 対象になるが、子要素を個別に preview-only にする場合は子要素に付与する)

### 業務設計者向けの記述ルール

- preview ダミーは実装可能性検証 (見栄え・幅・空白の確認) のために温存を推奨する
- **実データに置換することを前提とする要素** (検索結果 / カート明細 / 一覧表示等) は **必ず** `data-preview-only="true"` を付ける
- 静的に表示確定する要素 (固定テキスト / ヘッダーラベル / ナビゲーション等) には付けない

### バリデータ観点 (将来作業、本 ISSUE 範囲外)

以下のチェックを別 ISSUE で実装予定:

- `direction: "viewer"` の screen-item に対応する `data-item-id` が design.json にあるが、その配下に `data-preview-only` が無い → **warning**
- `data-preview-only` が付いているのに対応する screen-item や ViewDefinition への binding が無い → **warning**

### GrapesJS UI 連携 (将来作業、本 ISSUE 範囲外)

- 編集時に `data-preview-only` の要素にバッジ表示
- ブロック追加時に preview-only にするオプション

## 検証規約

`validate-dogfood.ts` 等のサンプル検証ツールは:

- `docs/sample-project-v3/<project>/` を 1 プロジェクト単位で読み込む
- 必須リソース (上記表) の存在を前提に動作する
- プロジェクトに必須リソースが欠落している場合は **エラー** とする (silent skip しない)
- プロジェクト横断の単一ファイルが存在しても無視する (プロジェクト内のものだけを参照)

## 過渡期の混在 (#616 で解消)

過去には `docs/sample-project-v3/` ルート直下にも retail プロジェクトの `project.json` / `tables/` / `process-flows/` / `screens/` / `extensions/` が残存していたが、ISSUE #616 で `docs/sample-project-v3/retail/` サブディレクトリに移動済み。現在は全プロジェクトがサブディレクトリ配置の規約に統一されている。

**新規追加は必ずプロジェクトサブディレクトリ内** に行うこと。ルート直下に成果物を配置することは禁止 (横断単一配置の反パターンに該当)。

## 関連

- `docs/spec/schema-governance.md` — schema 変更ガバナンス (本仕様の前提)
- `docs/spec/draft-state-policy.md` — 設計途中の保存許容ポリシー
- `validate-dogfood.ts` — サンプルプロジェクト検証 CLI (#607 で v3 対応中)
