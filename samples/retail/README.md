# retail — リテール総合 (EC + 店舗 POS + 在庫管理)

リリース時 examples 候補の **完結 業務 workspace サンプル** (#680 / #706)。EC・店舗 POS・在庫管理を統合したリテール業態をモデルにした中規模アプリ。

## 業務シナリオ (4 種、画面・処理・データを連携)

| シナリオ | 概要 | 関連画面 |
|---|---|---|
| 店舗在庫照会 | 商品コード・店舗で在庫数を検索表示。閾値以下は警告。 | 商品検索、在庫一覧 |
| カート追加 | 商品検索結果からカートに追加。重複排除 / null 区別。 | カート画面、追加モーダル |
| 注文確定 (TX) | カート → 確認 → 完了。在庫引き当て + 注文登録 + 採番をトランザクション保証。 | カート、確認、完了 |
| 配送指示 | バックオフィスで注文一覧を確認、配送指示登録。外部キャリア API 連携。 | 注文一覧、配送指示 |

補助画面: ダッシュボード、商品マスター、顧客マスター、店舗マスター。

## ディレクトリ構成

```
samples/retail/
├── project.json              # workspace ルート定義 (v3 schema)
├── README.md                 # 本ファイル
├── screens/                  # 画面 HTML (GrapesJS、見栄え重視)
├── screen-items/             # 画面項目定義 (各画面 1:1)
├── tables/                   # テーブル定義
├── actions/                  # 処理フロー (旧称 process-flows)
├── views/                    # SQL VIEW 定義
├── view-definitions/         # 一覧 UI viewer 定義
├── sequences/                # 採番シーケンス
├── extensions/retail/        # retail namespace 拡張定義
└── conventions/              # 業務規約カタログ (retail 拡張含む)
```

## 採用拡張 namespace

- `retail` — db-operations / field-types / steps / triggers / response-types を retail 業態に最適化

## 開き方 (動作確認)

designer UI から:

1. ヘッダーの「ワークスペース」 → 「フォルダを追加」
2. `samples/retail` を指定 (絶対 path 推奨)
3. **lockdown read-only で開く** (git 差分が出ない)

編集して試したい場合は `samples/retail/` を `data/` にコピーして開き直す (data/ は gitignore 済)。

## テスト fixture としての利用

```bash
# E2E / vitest で固定データとして使う
DESIGNER_DATA_DIR=samples/retail npm run dev:mcp
```

## 検証 (AJV)

`samples/**/*.json` は schema 検証 test に組み込まれる。schema 進化時に retail サンプルが breakage したら CI で検出。

## 関連

- 親メタ: #680
- 起票: #706
- spec: [docs/spec/samples-retail.md](../../docs/spec/samples-retail.md)
- 運用方針: memory `project_samples_strategy_2026_05_02.md`
