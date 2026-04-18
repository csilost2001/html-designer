# 一覧画面の共通仕様

Issue: [#133](https://github.com/csilost2001/html-designer/issues/133)
策定日: 2026-04-19

本ドキュメントは、一覧系画面の**操作・見た目・内部 API**の詳細仕様を定める。
イシュー #133 本文の「詳細仕様」としてリンクされる。

## 1. 目的

エディタ間で「クリック / 並び替え / 複数選択 / コピペ」等の挙動がバラバラになっている現状を、**Windows Explorer / Excel 準拠**の単一のパターンに統一し、内部実装も共通コンポーネントに集約する。

見た目 (カード / 表) は画面ごとに既定を維持しつつ、**切替可能**にする。エクスプローラの「詳細表示」と「アイコン表示」の関係と同じ。

## 2. 対象画面

| 機能名 | ルート | 既定表示 | 切替 UI |
|---|---|---|---|
| 画面一覧 | `/screen/list` (新設) | 未定 (実装時に決める) | カード ⇔ 表 |
| テーブル一覧 | `/table/list` | カード | カード ⇔ 表 |
| 処理フロー一覧 | `/process-flow/list` | カード | カード ⇔ 表 |
| テーブル定義 > カラム一覧 | `/table/edit/:id` 内のカラムタブ | 表 | 不要 |

### 画面フローの再定義

現在 `/screen/flow` 内で「フロー図 / 一覧」タブ切替となっているが、**2 機能に分離**する:

- **`/screen/flow`** = 画面フロー (画面遷移図)。キャンバス固定
- **`/screen/list`** (新設) = 画面一覧。他の一覧と同じ共通部品で実装

既存の `ScreenTableView` コンポーネントのロジックは新・画面一覧に移植。`FlowSubToolbar` の view mode 切替は削除。HeaderMenu に「画面一覧」を追加。CLAUDE.md の routing 表を更新。

## 3. 統一する操作

すべて **Windows Explorer / Excel 準拠**。迷ったら Excel の挙動を基準に実装する。

### 3.1 選択

表・カード共通。

| 操作 | 挙動 |
|---|---|
| クリック (単独) | 単一選択にリセット |
| Ctrl+ クリック | 選択のトグル (複数選択) |
| Shift+ クリック | アンカー (最後にクリックされた行) からクリック位置までの範囲選択 |
| Ctrl+A | 全選択 |
| Esc | 選択解除 |
| ダブルクリック | activate (編集画面へ遷移 等)。**クリックされた 1 行のみ**が対象。複数選択中でも、ダブルクリックされた行の `onActivate` が呼ばれる |
| 何もない領域のクリック | 選択解除 (ただし行クリックの誤認を避けるため、一覧コンテナの背景領域に限定) |

### 3.2 キーボード — 表レイアウト (list)

| キー | 挙動 |
|---|---|
| ↑ / ↓ | 選択を前 / 次の行に移動 (単一選択) |
| Shift+↑ / Shift+↓ | アンカーからの範囲を拡張 / 縮小 |
| Home / End | 先頭 / 末尾へ移動 |
| Ctrl+Home / Ctrl+End | 先頭 / 末尾へ移動し選択 |
| Enter / F2 | activate (単一選択時のみ) |
| Delete | 選択行を削除 (複数可、確認ダイアログあり) |
| Ctrl+C / Ctrl+X / Ctrl+V | コピー / 切り取り / 貼り付け (詳細 §3.4) |
| Ctrl+D | 選択行の複製 (直後に挿入) |
| Ctrl+A | 全選択 |
| Alt+↑ / Alt+↓ | 選択行を 1 つ上 / 下に移動 (D&D と同等、物理順変更) |
| Esc | 選択解除、コピー / カット状態の解除 |

### 3.3 キーボード — カードレイアウト (grid)

表レイアウトの上下キー以外は同じ。追加で **2D ナビゲーション**。

| キー | 挙動 |
|---|---|
| ↑ / ↓ | 上 / 下の行の近い列位置へ移動 |
| ← / → | 左 / 右のカードへ移動 |
| Shift+↑↓←→ | 範囲拡張 |

列数はウィンドウ幅によって動的に変わる。実装は `getBoundingClientRect()` で各カードの位置を取得し、現在カードの X 座標に最も近い上下行のカードを次の選択対象とする。行またぎの計算は:

1. 現在カードの `top` を取得
2. 現在カードより **top が大きい** (下の行にある) カードのうち `top` が最小のグループが「次の行」
3. その行で、現在カードの `left` に最も近いカードが移動先
4. ↑ は逆方向

画面リサイズで行列数が変わっても、この計算で自然に追従する。

### 3.4 クリップボード — コピペによる移動 / 複製

**ブラウザ内クリップボード** (内部 state) を使用。外部 (Excel 等) とは連携しない。

#### 挙動

| 操作 | 挙動 |
|---|---|
| Ctrl+C | 選択項目を**コピー**としてクリップボードへ。元の表示は変化なし |
| Ctrl+X | 選択項目を**切り取り**としてクリップボードへ。元の項目は**半透明表示** (opacity 0.5) になるが、貼り付けるまで物理的には削除されない |
| Ctrl+V | クリップボードの内容を**挿入位置**に挿入。切り取りなら移動 (元は削除)、コピーなら複製 |
| Esc | クリップボード破棄。ghosted 表示解除 |
| 新しい Ctrl+C / Ctrl+X | 前の内容は破棄 (上書き) |

#### 挿入位置ルール

貼り付け時の挿入位置は以下のルール:

1. **選択なし**: 末尾に挿入
2. **単一選択**: 選択行の**直後**に挿入
3. **複数選択 (連続)**: 最後の選択行の直後に挿入
4. **複数選択 (非連続)**: 物理順で最も後ろの選択行の直後に挿入
5. **貼り付け対象自身が選択中の場合** (Ctrl+X → 同じ選択のまま Ctrl+V): 何もしない (no-op)

切り取り→貼り付けが移動になる場合、**元の位置からは削除され、新しい位置に挿入**される。移動後は貼り付けた項目が選択状態になる。

#### クリップボード寿命

- **セッション (= タブ) 内のみ**: ページ再読み込みで消える
- **タブ間共有はしない**
- localStorage 等への永続化はしない

#### フィルタ / ソートとの相互作用

§3.6 / §3.7 を参照。

### 3.5 物理順の変更 (D&D)

| 操作 | 挙動 |
|---|---|
| 行 / カードをドラッグ | ドラッグ中は半透明表示、ドロップ先候補の位置にマーカー (線) 表示 |
| ドロップ | 物理順を書き換える |

- 表レイアウト: 行間に水平線のマーカー
- カードレイアウト: カード間に垂直線のマーカー (複数行に跨る場合、行内で判定)

D&D ハンドル:

- 表レイアウト: 行の左端にハンドル (`bi-grip-vertical`) を表示
- カードレイアウト: カード全体を掴めるようにする (ハンドル不要)

### 3.6 ソート (見た目だけ)

| 操作 | 挙動 |
|---|---|
| 列ヘッダクリック | その列で昇順ソート。再クリックで降順。3 回目クリックで解除 |
| **Shift+** 列ヘッダクリック | 第 2 / 第 3 ソートキーを追加 (多段ソート) |
| 既にソート中の列を通常クリック | 多段ソートを解除して、その列のみの単一ソートに |

#### 視覚表示

- ソート対象の列ヘッダに **▲ (昇順) / ▼ (降順)** アイコン
- 多段ソート時、アイコンの前に順位数字 **① ② ③** を表示
- ソートの状態が分かるよう、ヘッダの背景を薄く強調

#### 重要な制約

- **物理順 (No 列) は変更しない**
- **状態の永続化はしない** (画面を開き直すとリセット)
- **ソート中に物理順変更操作 (D&D / Ctrl+X → V / 追加) は許可する**。その場合、物理順は論理的に正しく更新される (見かけのソート順と独立)。ただし、移動結果がソート状態では見えづらいので、**物理順変更時に自動でソートを解除する**方針を推奨 (要実装時確認)

### 3.7 フィルタ

共通処理を提供。各画面は**自分のフィルタ UI** (チェックボックス・検索ボックス等) を自由に実装し、共通フックに**述語関数 `(item) => boolean`** を渡す。

#### 共通コンポーネント

- `useListFilter<T>(items)` フック: フィルタ state + filtered 計算
- `<FilterBar>` コンポーネント: 「N 件 / 全 M 件 [フィルタクリア]」表示

#### 重要な制約

- **状態の永続化はしない** (今は)
- **フィルタ中も選択・D&D・コピペは動作する**
  - D&D / コピペは**絞り込まれた見える範囲内で操作**するが、物理順の変更は**隠れた項目の順序を壊さない**ように計算
  - 具体: 「filtered[i] を filtered[j] に移動」は「physical[ids[i].index] を physical[ids[j].index] の位置に移動」と解釈。隠れた項目は前後関係を維持
- **選択状態はフィルタ変更で失われない**が、フィルタで消えた項目が選択リストから除かれる
- **フィルタ中の Ctrl+A は「見えている項目の全選択」**

### 3.8 選択状態とソート / フィルタの相互作用

| 事象 | 挙動 |
|---|---|
| ソート適用 | 選択状態維持 |
| ソート解除 | 選択状態維持 |
| フィルタ適用 | 見えなくなった項目は選択から外れる |
| フィルタクリア | 選択状態維持 (再表示された項目は選択状態が復活**しない**) |
| ページ再読み込み | 選択状態リセット |

## 4. 見た目

### 4.1 表レイアウト (エクスプローラの詳細表示)

- 列ヘッダ: 固定高、背景色で視覚的に区別、ソート対象列はハイライト
- 行: 1 行 1 項目、ホバー / 選択時のハイライト色を変える
- No 列 (最左): 右寄せ、等幅フォント
- D&D ハンドル: 行の先頭 (No 列の前)
- ダーク / ライト両対応 (`variant="light" | "dark"`)

### 4.2 カードレイアウト (エクスプローラのアイコン表示)

- グリッド配置 (CSS Grid `repeat(auto-fill, minmax(…))`)
- カード幅: 画面によって調整可能 (既定 280px)
- 各カード内のレイアウトは画面ごとにカスタム (カスタムレンダラ)
- No 列は**表示しない** (カードレイアウトでは非表示が自然)。ただし物理順はデータ側で保持
- 選択・ホバーの視覚表現は表と一貫したハイライト色
- カード全体が D&D ハンドル

### 4.3 切替 UI

- 一覧ヘッダ (ページタイトルの右) に、カード/表の**アイコントグル**を配置
  - アイコン例: `bi-grid-3x3-gap` (カード) / `bi-list-task` (表)
- 切替状態は **localStorage に永続化** (画面ごとに個別。キー: `list-view-mode:{feature-name}`)
  - 例: `list-view-mode:table-list`、`list-view-mode:action-list`
- 切替対象外の画面 (テーブル定義 > カラム一覧) にはトグル非表示

### 4.4 フィルタバー

- 一覧コンテナの上部 (`<FilterBar>`) に横長で配置
- フィルタが効いていれば表示、なければ非表示
- テキスト例: 「カテゴリ: 画面のみ — 3 件 / 全 10 件」+ 「フィルタクリア」ボタン

## 5. API スケッチ

### 5.1 `useListSelection<T>` (既存・PR #138)

```ts
interface ListSelection<T> {
  selectedIds: Set<string>;
  selectedItems: T[];
  isSelected: (id: string) => boolean;
  setSelectedIds: (ids: Set<string>) => void;
  clearSelection: () => void;
  selectAll: () => void;
  handleRowClick: (id: string, e: { ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean }) => void;
  getAnchorId: () => string | null;
}

function useListSelection<T>(items: T[], getId: (item: T) => string): ListSelection<T>;
```

### 5.2 `useListKeyboard<T>` (既存 + 拡張)

```ts
interface ListKeyboardOpts<T> {
  items: T[];
  getId: (item: T) => string;
  selection: ListSelection<T>;
  clipboard?: ListClipboard<T>;
  /** "list" = 表レイアウト (↑↓のみ) / "grid" = カードレイアウト (↑↓←→) */
  layout?: "list" | "grid";
  /** grid レイアウト時の列数取得関数 (getBoundingClientRect ベース想定) */
  getColumnCount?: () => number;
  onActivate?: (item: T) => void;
  onDelete?: (items: T[]) => void;
  onDuplicate?: (items: T[]) => void;
  onMoveUp?: (items: T[]) => void;
  onMoveDown?: (items: T[]) => void;
  enabled?: boolean;
}

function useListKeyboard<T>(opts: ListKeyboardOpts<T>): void;
```

### 5.3 `useListClipboard<T>` (新設)

```ts
type ClipboardMode = "copy" | "cut";

interface ListClipboardState<T> {
  mode: ClipboardMode | null;
  items: T[];
}

interface ListClipboard<T> {
  clipboard: ListClipboardState<T>;
  hasContent: boolean;
  copy: (items: T[]) => void;
  cut: (items: T[]) => void;
  clear: () => void;
  /** 貼り付け実行時に呼ぶ。cut なら items を返して clear。copy なら items のディープコピーを返す */
  consume: () => T[];
  /** 指定 ID が「切り取り対象 (ghosted 表示)」か判定 */
  isItemCut: (id: string) => boolean;
}

function useListClipboard<T>(getId: (item: T) => string): ListClipboard<T>;
```

### 5.4 `useListFilter<T>` (新設)

```ts
interface ListFilter<T> {
  filtered: T[];
  isActive: boolean;
  totalCount: number;
  visibleCount: number;
  applyFilter: (predicate: ((item: T) => boolean) | null) => void;
  clearFilter: () => void;
}

function useListFilter<T>(items: T[]): ListFilter<T>;
```

### 5.5 `useListSort<T>` (新設)

```ts
interface SortKey {
  columnKey: string;
  direction: "asc" | "desc";
}

interface ListSort<T> {
  sortKeys: SortKey[];
  sorted: T[];
  toggleSort: (columnKey: string, opts?: { addKey?: boolean }) => void;
  clearSort: () => void;
  getSortRank: (columnKey: string) => number | null;  // 多段ソート時の順位 (1-indexed)
  getSortDirection: (columnKey: string) => "asc" | "desc" | null;
}

function useListSort<T>(
  items: T[],
  getSortAccessor: (item: T, columnKey: string) => string | number,
): ListSort<T>;
```

### 5.6 `DataList<T>` (差し替え)

```ts
interface DataListColumn<T> {
  key: string;
  header: ReactNode;
  render: (item: T, index: number) => ReactNode;
  width?: string;
  align?: "left" | "center" | "right";
  className?: string;
  sortable?: boolean;
  sortAccessor?: (item: T) => string | number;
}

interface DataListProps<T> {
  items: T[];
  columns: DataListColumn<T>[];
  getId: (item: T) => string;
  selection?: ListSelection<T>;
  clipboard?: ListClipboard<T>;
  sort?: ListSort<T>;
  onActivate?: (item: T, index: number) => void;
  onReorder?: (fromIndex: number, toIndex: number) => void;
  /** レイアウト。"list" = 表、"grid" = カード */
  layout?: "list" | "grid";
  /** grid レイアウト時のカードレンダラ (columns は使われない) */
  renderCard?: (item: T, index: number) => ReactNode;
  showNumColumn?: boolean;
  emptyMessage?: ReactNode;
  className?: string;
  variant?: "light" | "dark";
}

function DataList<T>(props: DataListProps<T>): ReactElement;
```

### 5.7 `<FilterBar>` (新設)

```tsx
interface FilterBarProps {
  isActive: boolean;
  totalCount: number;
  visibleCount: number;
  /** "カテゴリ: 画面のみ" のような現在のフィルタ条件説明 */
  label?: string;
  onClear: () => void;
}

function FilterBar(props: FilterBarProps): ReactElement | null;
```

### 5.8 `<ViewModeToggle>` (新設)

```tsx
interface ViewModeToggleProps {
  mode: "card" | "table";
  onChange: (mode: "card" | "table") => void;
  /** localStorage への永続化キー */
  storageKey?: string;
}

function ViewModeToggle(props: ViewModeToggleProps): ReactElement;
```

### 5.9 画面側の使用イメージ

```tsx
function TableListView() {
  const [tables, setTables] = useState<TableMeta[]>([]);
  const [viewMode, setViewMode] = usePersistentState<"card" | "table">("list-view-mode:table-list", "card");
  
  const filter = useListFilter(tables);
  const sort = useListSort(filter.filtered, (item, key) => getSortAccessor(item, key));
  const selection = useListSelection(sort.sorted, (t) => t.id);
  const clipboard = useListClipboard<TableMeta>((t) => t.id);
  
  useListKeyboard({
    items: sort.sorted,
    getId: (t) => t.id,
    selection,
    clipboard,
    layout: viewMode === "card" ? "grid" : "list",
    onActivate: (t) => navigate(`/table/edit/${t.id}`),
    onDelete: handleDelete,
    onDuplicate: handleDuplicate,
  });
  
  return (
    <div>
      <Header>
        <h2>テーブル設計書</h2>
        <ViewModeToggle mode={viewMode} onChange={setViewMode} />
      </Header>
      
      <MyFilterUI onChange={(pred) => filter.applyFilter(pred)} />
      <FilterBar {...filter} onClear={filter.clearFilter} />
      
      <DataList
        items={sort.sorted}
        columns={columns}
        getId={(t) => t.id}
        selection={selection}
        clipboard={clipboard}
        sort={sort}
        layout={viewMode === "card" ? "grid" : "list"}
        renderCard={renderTableCard}
        onActivate={(t) => navigate(`/table/edit/${t.id}`)}
        onReorder={handleReorder}
      />
    </div>
  );
}
```

## 6. 技術方針

### 6.1 ライブラリ選定

- **TanStack Table (MIT)** — headless table。row model / 列管理 / ソート / フィルタのエンジンとして活用。レンダリングはしないので、カード表示にも同じデータモデルを流用できる
- **`@dnd-kit`** — 既にプロジェクトで使用中。そのまま継続
- **選択 / キーボード / コピペ / フィルタ / ソート は自作フック** — 細かい UX をコントロールするため

### 6.2 TanStack Table の使い所

- sort state 管理 (PR #138 の useListSort は TanStack の sorted row model に差し替え可能)
- 列定義の型 (`ColumnDef<T>`)
- カラム visibility / ordering (将来用)
- row model をカードレイアウトにも流用

### 6.3 移行方針

PR #138 で作った自作 `DataList` / `useListSelection` / `useListKeyboard` は Phase A で TanStack ベースに差し替えるが、**対外 API は互換を保つ**ことを目標にする (既存使用箇所を壊さないため)。

## 7. Phase 分け (各 Phase = 1 PR)

| Phase | 内容 | 視覚影響 | 規模 |
|---|---|---|---|
| A | TanStack Table 導入 + 共通フック完全版 (選択・キー・コピペ・フィルタ・ソート) + `DataList` 差し替え + `<FilterBar>` + `<ViewModeToggle>` + カード版レンダラ対応 | ゼロ (基盤のみ) | 大 |
| B | テーブル定義 > カラム一覧を共通部品に移行 | 小 (既に表、微調整) | 中 |
| C | 画面一覧の新設 (画面フローから分離、HeaderMenu・CLAUDE.md 更新) | 中 (新機能・新タブ) | 中 |
| D | 処理フロー一覧を共通部品化 + カード/表切替追加 | 中 (切替 UI 追加) | 中 |
| E | テーブル一覧を共通部品化 + カード/表切替追加 | 中 (切替 UI 追加) | 中 |

各 Phase は独立した PR として作成・レビュー・マージ。視覚影響のある B〜E はマージ前にユーザー目視確認必須。

## 8. 受け入れ条件

- [ ] 共通フック (`useListSelection` / `useListKeyboard` / `useListClipboard` / `useListFilter` / `useListSort`) が提供され、Vitest で主要ケースが検証されている
- [ ] `DataList` が TanStack ベースで table / grid 両レイアウトを表示できる
- [ ] 対象 4 画面すべて (画面一覧 / テーブル一覧 / 処理フロー一覧 / テーブル定義 > カラム) が共通部品を使っている
- [ ] カード ⇔ 表切替が機能し、状態が localStorage に画面ごと永続化される
- [ ] Excel/Explorer 準拠の操作が全画面で統一動作:
  - クリック / Ctrl+ / Shift+ / Ctrl+A / Esc / ダブルクリック
  - ↑↓ (表) / ↑↓←→ (カード) / Shift+ 拡張
  - Enter / F2 / Delete / Ctrl+C/X/V/D / Alt+↑↓
- [ ] No 列が表レイアウトに表示され、D&D / Ctrl+X→V / 追加 / 削除で物理順が正しく更新・永続化される
- [ ] 列ヘッダクリックソート (単一・多段 Shift+ クリック) が動作。▲▼ と順位 ① ② ③ が表示される
- [ ] フィルタ API が動作し、`<FilterBar>` が共通で利用できる
- [ ] 画面フローと画面一覧が分離され、HeaderMenu・ルーティング・CLAUDE.md が更新されている
- [ ] Playwright テストが主要一覧 (特に画面一覧・テーブル一覧) に追加または更新されている

## 9. スコープ外 (将来対応)

- ブラウザ外 (Excel 等) クリップボードとの連携 (ペースト機能)
- ソート / フィルタ状態の永続化
- 仮想スクロール (現状の件数規模では不要)
- 列幅のユーザーカスタマイズ・永続化
- 列の表示/非表示カスタマイズ
- グループ化表示
- カラム順序のユーザーカスタマイズ

将来これらが必要になったとき、TanStack Table ベースの採用により拡張しやすい。

## 10. Excel / Explorer 参照動作 (迷った時の拠り所)

実装中に仕様が曖昧な箇所に遭遇したら、以下の順で判断する:

1. Excel で同じ操作をしたらどうなるか
2. Windows エクスプローラの「詳細表示」または「大アイコン表示」で同じ操作をしたらどうなるか
3. それでも決まらない場合は、**ユーザーに確認する** (勝手にスコープを縮退させない)

## 11. 変更履歴

- 2026-04-19: 初版。#133 の当初方針 (「カード → 表に一律変更」) をスコープ再定義 (「表/カード併存、切替提供、共通実装」) して本仕様を策定。PR #139 (誤った方向の実装) クローズ、PR #138 (共通基盤) を本仕様の Phase A で TanStack ベースに差し替え
