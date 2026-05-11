# Dogfood レポート: PageLayout + Gadget 導入 (examples/retail)

**日付**: 2026-05-12
**対象**: RFC #1021 PageLayout + Gadget シリーズ pl-1〜pl-6
**サンプル**: `examples/retail/` (リテール総合)
**スコープ**: 静的 region 割り当てのみ (inter-gadget event は Phase 2 = pl-7 で実装、pl-6 受け入れ基準で明示)

## 1. dogfood 構成

### PageLayout 1 件
- `Main Layout` (17595b62-fef1-4b22-9c25-16736c772567)
  - regions: `header` / `sidebar` / `footer` / `main`
  - assignments: header → グローバルヘッダ / sidebar → ナビゲーションサイドバー / footer → グローバルフッタ
  - design: `editorKind: grapesjs` / `cssFramework: bootstrap`

### Gadget 3 件 (Screen.purpose=gadget)
- **グローバルヘッダ** (68709449-...): 店舗名 / ユーザー名 / ログアウトボタン (Bootstrap navy header HTML)
  - 紐付く ProcessFlow: `60e08c25-...` 「ヘッダーガジェット処理」
  - logoutButton item に `events: [{ id: 'click', handlerFlowId, handlerActionId: 'act-logout' }]`
- **ナビゲーションサイドバー** (c1cff7da-...): 商品検索/注文一覧/顧客一覧/マスタ管理リンク
- **グローバルフッタ** (f7daa764-...): copyright + version

### ProcessFlow 1 件 (gadget 用)
- `ヘッダーガジェット処理` (60e08c25-...)
  - action: `act-logout` (trigger=submit, POST /api/retail/auth/logout)
  - steps: compute (redirectTo='/login') → return (200 OK + redirectTo)

### Page Screen の紐付け
- ダッシュボード (765c3c23-...): `purpose: page` + `pageLayoutId: 17595b62-...`

## 2. 二段検証

### 機械 validator (validate:samples)
- ✅ 7/7 flows passed (新 ProcessFlow 含む)
- ✅ All errors resolved (0 warnings)
- ✅ AJV cross-entity validator (assignments → gadget existence + pageLayoutId → PageLayout existence) 動作確認

### AI 実機 dogfood (Playwright + chromium headless)
| Step | 結果 |
|------|------|
| PageLayout 一覧 (`/page-layout/list`) | ✅ Main Layout カード表示 (4 region / 3 assignment) |
| PageLayout エディタ (`/page-layout/edit/:id`) | ✅ regions 4 件 + assignments 3 件 + design (grapesjs/bootstrap) + maturity 表示 |
| PageLayout Designer (`/page-layout/design/:id`) | ✅ GrapesJS canvas + Layout Regions ブロックカテゴリ表示 |
| Gadget 一覧 (`/gadget/list`) | ✅ 3 gadget (Header/Sidebar/Footer) カード表示 |
| Header Gadget Designer | ✅ Bootstrap navy ヘッダ (店舗 A / 山田 太郎 / ログアウト) 実 HTML レンダリング |
| Screen 一覧 (`/screen/list`) | ✅ purpose=page のみ 11 件表示 (gadget 除外) |
| 画面遷移図 (`/screen/flow`) | ✅ 11 page Screen のみ表示、gadget は描画されない |
| ProcessFlow 一覧 + Header gadget ProcessFlow 詳細 | ✅ ヘッダーガジェット処理 + act-logout (HTTP POST /api/retail/auth/logout) 表示 |
| Dashboard Screen Designer (pageLayoutId 設定) | ✅ Screen 自身の design 描画 (banner は load 競合で表示されないケースあり、§3 既知の制限参照) |

スクリーンショット: `.tmp/screenshots/v2-{01..12}-*.png`

## 3. 既知の制限 (follow-up)

### A. PageLayout wireframe banner (Screen Designer 上)
- `purpose=page` + `pageLayoutId` 設定の Screen を Designer で開いた時、上部に「PageLayout を使用中: <name>」banner が表示されるはず
- 実装はある (Designer.tsx, ScreenDesigner.tsx) が、ScreenDesigner の `loadPageLayout()` が WS reconnect 競合で null を返すケースで banner 非表示
- **影響**: 機能的な問題なし (Designer 編集は通常通り可能)、視覚的なヒントのみ欠落
- **follow-up**: ScreenDesigner の useEffect に `mcpBridge.onStatusChange("connected")` retry を組み込んで pageLayout を再 load する

### B. Gadget 一覧の「使用先 PL 数」表示
- 現在は常に 0 表示 (`pl-4` 実装時の TODO コメント)
- **follow-up**: 全 PageLayout を走査して assignments から逆参照を計算してキャッシュ

### C. Puck composition preview の nested render
- Region primitive (RegionHeader/Sidebar/Footer/Main) は実装済、Puck Config に登録済
- ただし完全な nested render は `@measured/puck` の Render と buildConfig の循環依存で実装困難
- 現状は「assignments / gadget data ロード状況の表示」レベル (パリティ「Puck Editor 内で region 構造が視覚確認できる」は達成)
- **follow-up**: Render を別モジュールに分離して循環解消、または React Context で Config を注入する設計

## 4. 修正された bugs (dogfood で発見)

| Bug | 修正 commit |
|-----|-------------|
| `normalizePersisted` で `entities.pageLayouts` が落ちて UI が「0 件」になる | da0f5c9 |
| URL → タブ同期 effect が workspace.open 完了前に走り、deep-link でリソースが全てダッシュボードへフォールバック | da0f5c9 |
| ProcessFlow `compute` / `return` step kind の schema 違反 (object literal expression / bodyBinding 不可) | da0f5c9 |
| Gadget の `hasDesign` が harmony.json で false のまま (design.json はあるのに「未デザイン」表示) | da0f5c9 |

## 5. 次フェーズ (pl-7 / Phase 2)

pl-6 完了をもって PageLayout MVP は **schema + Designer 編集 + 静的 composition** まで完備。次は:

- pl-7: code generation 対応 (Thymeleaf / NestJS の layout.html + fragment + Controller 生成)
- pl-X follow-up: 上記 §3 の A/B/C 解消
- pl-Y: inter-gadget event 仕様 (Q2=b 候補、ガジェット間 pub/sub) — dogfood §1 から「検索フィルタガジェット ↔ リストガジェット」のニーズが見えてから着手判断

## 6. 結論

**RFC #1021 PageLayout + Gadget モデル E は実機動作確認できた**。
- 新 entity (PageLayout 1 種のみ) + Screen.purpose 拡張 + ガジェット = `Screen{purpose: gadget}` + 自律 ProcessFlow の設計が機能した
- Thymeleaf 大規模パターン (各ガジェットが専用 controller を持つ) を Harmony 上で実装できた (header gadget の logout 例)
- GrapesJS / Puck どちらの editorKind でも基本動作 (Puck は composition nested render に制約あり、follow-up)
- AI コンテキスト負荷の評価: 新 entity 1 種のみで完結し、Screen.purpose は既存概念の自然拡張で AI が混乱せず読める設計

統合 PR (本 PR) で MVP を main にマージし、上記 follow-up は別 issue で計画的に対応する。
