import { useEffect, useRef, useState } from "react";
import { Routes, Route, useLocation, useNavigate, matchPath } from "react-router-dom";
import { FlowEditor } from "./flow/FlowEditor";
import { ScreenListView } from "./flow/ScreenListView";
import { TableListView } from "./table/TableListView";
import { TableEditor } from "./table/TableEditor";
import { ErDiagram } from "./table/ErDiagram";
import { ProcessFlowListView } from "./process-flow/ProcessFlowListView";
import { ProcessFlowEditor } from "./process-flow/ProcessFlowEditor";
import { ExtensionsPanel } from "./extensions/ExtensionsPanel";
import { ConventionsCatalogView } from "./conventions/ConventionsCatalogView";
import { ScreenItemsView } from "./screen-items/ScreenItemsView";
import { SequenceListView } from "./sequence/SequenceListView";
import { SequenceEditor } from "./sequence/SequenceEditor";
import { ViewListView } from "./view/ViewListView";
import { ViewEditor } from "./view/ViewEditor";
import { ViewDefinitionListView } from "./view-definition/ViewDefinitionListView";
import { ViewDefinitionEditor } from "./view-definition/ViewDefinitionEditor";
import { WorkspaceListView } from "./workspace/WorkspaceListView";
import { WorkspaceSelectView } from "./workspace/WorkspaceSelectView";
import { Designer } from "./Designer";
import { DashboardView } from "./dashboard/DashboardView";
import { TabBar } from "./TabBar";
import { CommonHeader } from "./CommonHeader";
import { mcpBridge } from "../mcp/mcpBridge";
import { loadProject } from "../store/flowStore";
import { loadTable } from "../store/tableStore";
import { loadProcessFlow } from "../store/processFlowStore";
import { loadSequence } from "../store/sequenceStore";
import { loadView } from "../store/viewStore";
import { loadViewDefinition } from "../store/viewDefinitionStore";
import {
  getTabs,
  getActiveTabId,
  subscribe,
  openTab,
  setActiveTab,
  closeTab,
  makeTabId,
  clearPersistedTabs,
  type TabItem,
  type TabType,
} from "../store/tabStore";
import {
  getState as getWorkspaceState,
  subscribe as subscribeWorkspace,
  loadWorkspaces,
  subscribeWorkspaceChanges,
} from "../store/workspaceStore";
import { useTabKeyboard } from "../hooks/useTabKeyboard";
import { ErrorBoundary } from "./common/ErrorBoundary";
import { TabErrorFallback } from "./common/ErrorFallback";
import { ResourceLoading } from "./common/ResourceLoading";
import { useErrorDialog } from "./common/ErrorDialogProvider";
import { recordError } from "../utils/errorLog";

function useTabs() {
  const [tabs, setTabs] = useState<readonly TabItem[]>(getTabs);
  const [activeTabId, setActiveTabIdState] = useState(getActiveTabId);
  useEffect(() => {
    return subscribe(() => {
      setTabs(getTabs());
      setActiveTabIdState(getActiveTabId());
    });
  }, []);
  return { tabs, activeTabId };
}

export function AppShell() {
  const { tabs, activeTabId } = useTabs();
  const location = useLocation();
  const navigate = useNavigate();
  const { showError } = useErrorDialog();
  useTabKeyboard();

  // ワークスペース状態管理
  const [workspaceState, setWorkspaceState] = useState(getWorkspaceState());
  useEffect(() => {
    return subscribeWorkspace(() => setWorkspaceState(getWorkspaceState()));
  }, []);

  // AppShell が MCP 接続のライフサイクルを単一所有する (#676 review):
  //  - mount 時に startWithoutEditor() を 1 度呼んで能動起動 (Dashboard 等で初回ランディング
  //    した時にも bridge を必ず立ち上げる)。
  //  - "connected" 受信で loadWorkspaces して active state を最新化。
  //  - "disconnected" は mcpBridge 自身が RETRY_DELAY_MS の retry timer を回すので、AppShell は
  //    何もしない (二重 reconnect で接続が在りえない遷移をするのを避けるため)。
  //  - Designer は workspace 機能を破壊しないよう mcpBridge.stop() を呼ばない設計に変更済み
  //    (Designer.tsx 参照)。なので AppShell が stop() の事後復帰を心配する必要は無い。
  useEffect(() => {
    const unsubBroadcast = subscribeWorkspaceChanges();
    const bridge = mcpBridge as unknown as {
      onStatusChange: (cb: (s: string) => void) => () => void;
      startWithoutEditor: () => void;
    };
    const unsubStatus = bridge.onStatusChange((s) => {
      if (s === "connected") {
        loadWorkspaces().catch(console.error);
      }
    });
    bridge.startWithoutEditor();
    return () => { unsubBroadcast(); unsubStatus(); };
  }, []);

  // workspace.changed → ストア / 描画中 view を完全に破棄するためページ再読込。
  // per-resource タブを閉じるだけでは singleton stores (flowStore, tableStore 等) と
  // 現在マウント中の singleton view (DashboardView, ScreenListView 等) が旧 workspace の
  // データを保持し、その状態から保存すると新 workspace に旧データが混入するため。
  //
  // 重要: 初回 hydration (起動時の自動 active 設定: store の初期 null → 復元された id) は
  // 「切替」ではないのでリロードしない。リロード対象は prev が non-null だった場合のみ。
  // null → non-null をリロードすると、リロード後また初期 null に戻り再 hydration → 再リロードで
  // 無限ループになる。
  const prevActiveWorkspaceIdRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const currentId = workspaceState.active?.id ?? null;
    if (prevActiveWorkspaceIdRef.current === undefined) {
      // 1 回目の effect 実行: 記録のみ
      prevActiveWorkspaceIdRef.current = currentId;
      return;
    }
    if (prevActiveWorkspaceIdRef.current === currentId) return;
    if (prevActiveWorkspaceIdRef.current === null) {
      // null → non-null: 初回 hydration (backend の auto-restore など)。
      // 既存 store / view は new workspace のデータでまだ何も染まっていないのでリロード不要。
      prevActiveWorkspaceIdRef.current = currentId;
      return;
    }
    // non-null → 別の non-null / null: ユーザー操作による workspace 切替 / 閉じる
    prevActiveWorkspaceIdRef.current = currentId;
    const perResourceTypes: TabType[] = ["design", "table", "process-flow", "sequence", "view", "view-definition"];
    const dirtyLabels = getTabs()
      .filter((t) => t.isDirty && perResourceTypes.includes(t.type))
      .map((t) => t.label);
    if (dirtyLabels.length > 0) {
      console.warn(`[workspace] 未保存タブを強制破棄: ${dirtyLabels.join(", ")}`);
    }
    // localStorage に永続化された旧 workspace のタブ / GrapesJS screen キャッシュを破棄してから reload。
    // これを怠ると、reload 後にタブ復元 → URL sync で旧 resource ID へ navigate → 切替先 workspace に
    // 同 ID があれば stale 表示・誤保存、無ければ dashboard fallback、というバグになる。
    clearPersistedTabs();
    try {
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (k && k.startsWith("gjs-")) localStorage.removeItem(k);
      }
    } catch { /* private browsing / quota error は無視 */ }
    window.location.reload();
  }, [workspaceState.active?.id]);

  // ルーティングガード: active===null かつ /workspace/list でも /workspace/select でもない → /workspace/select へ
  // backend オフライン時は error が立つ → ガードを停止して localStorage fallback 経路を温存する。
  // (AGENTS.md "If WS disconnected → localStorage" の互換性確保)
  useEffect(() => {
    if (workspaceState.loading) return; // ロード中は判定しない
    if (workspaceState.lockdown) return; // lockdown 時はガード不要 (常にアクティブ扱い)
    if (workspaceState.error !== null) return; // load 失敗 (offline 等) は redirect しない
    if (workspaceState.active === null) {
      const excluded = ["/workspace/list", "/workspace/select"];
      if (!excluded.includes(location.pathname)) {
        navigate("/workspace/select", { replace: true });
      }
    }
  }, [workspaceState.active, workspaceState.loading, workspaceState.lockdown, workspaceState.error, location.pathname]);

  // CSS variables でヘッダー・タブバーの高さを各コンポーネントに伝える
  useEffect(() => {
    document.documentElement.style.setProperty("--common-header-h", "40px");
  }, []);

  useEffect(() => {
    const h = tabs.length > 0 ? "32px" : "0px";
    document.documentElement.style.setProperty("--tabbar-h", h);
  }, [tabs.length]);

  // リソース詳細 URL で対象が見つからなかったときにダッシュボードへ戻す共通処理。
  // ブラウザが握っている URL を「存在しないリソース」のまま放置すると次回リロードで
  // また袋小路に入るため、URL 自体も / に書き換える。
  const fallbackToDashboard = (kind: string, id: string) => {
    const msg = `URL が指すリソース (${kind}: ${id}) が見つかりません。ダッシュボードへフォールバック。`;
    recordError({
      source: "manual",
      message: msg,
      context: { kind, id, pathname: location.pathname },
    });
    showError({
      title: `${kind}が見つかりません`,
      message: `指定された${kind} (${id}) は存在しないか削除されています。ダッシュボードに戻ります。`,
      context: { kind, id, pathname: location.pathname },
      skipLogRecord: true, // 直前に recordError 済み
    });
    navigate("/", { replace: true });
  };

  // URL → タブ同期（ブラウザの直接ナビゲーション / mcpBridge.navigateScreen）
  useEffect(() => {
    const designMatch = matchPath("/screen/design/:screenId", location.pathname);
    if (designMatch?.params.screenId) {
      const screenId = designMatch.params.screenId;
      const tabId = makeTabId("design", screenId);
      const existing = getTabs().find((t) => t.id === tabId);
      if (existing) {
        setActiveTab(tabId);
      } else {
        loadProject().then((project) => {
          const screen = project.screens.find((s) => s.id === screenId);
          if (screen) {
            openTab({ id: tabId, type: "design", resourceId: screenId, label: screen.name });
          } else {
            fallbackToDashboard("画面", screenId);
          }
        }).catch((e) => {
          recordError({ source: "manual", message: "loadProject 失敗", stack: e instanceof Error ? e.stack : undefined });
          fallbackToDashboard("画面", screenId);
        });
      }
      return;
    }

    const tableMatch = matchPath("/table/edit/:tableId", location.pathname);
    if (tableMatch?.params.tableId) {
      const tableId = tableMatch.params.tableId;
      const tabId = makeTabId("table", tableId);
      const existing = getTabs().find((t) => t.id === tabId);
      if (existing) {
        setActiveTab(tabId);
      } else {
        loadTable(tableId).then((table) => {
          if (table) {
            openTab({ id: tabId, type: "table", resourceId: tableId, label: table.name ?? table.physicalName });
          } else {
            fallbackToDashboard("テーブル", tableId);
          }
        }).catch((e) => {
          recordError({ source: "manual", message: "loadTable 失敗", stack: e instanceof Error ? e.stack : undefined });
          fallbackToDashboard("テーブル", tableId);
        });
      }
      return;
    }

    const actionMatch = matchPath("/process-flow/edit/:processFlowId", location.pathname);
    if (actionMatch?.params.processFlowId) {
      const processFlowId = actionMatch.params.processFlowId;
      const tabId = makeTabId("process-flow", processFlowId);
      const existing = getTabs().find((t) => t.id === tabId);
      if (existing) {
        setActiveTab(tabId);
      } else {
        loadProcessFlow(processFlowId).then((ag) => {
          if (ag) {
            openTab({ id: tabId, type: "process-flow", resourceId: processFlowId, label: ag.name });
          } else {
            fallbackToDashboard("処理フロー", processFlowId);
          }
        }).catch((e) => {
          recordError({ source: "manual", message: "loadProcessFlow 失敗", stack: e instanceof Error ? e.stack : undefined });
          fallbackToDashboard("処理フロー", processFlowId);
        });
      }
      return;
    }

    const sequenceMatch = matchPath("/sequence/edit/:sequenceId", location.pathname);
    if (sequenceMatch?.params.sequenceId) {
      const sequenceId = sequenceMatch.params.sequenceId;
      const tabId = makeTabId("sequence", sequenceId);
      const existing = getTabs().find((t) => t.id === tabId);
      if (existing) {
        setActiveTab(tabId);
      } else {
        loadSequence(sequenceId).then((seq) => {
          if (seq) {
            openTab({ id: tabId, type: "sequence", resourceId: sequenceId, label: seq.id });
          } else {
            fallbackToDashboard("シーケンス", sequenceId);
          }
        }).catch((e) => {
          recordError({ source: "manual", message: "loadSequence 失敗", stack: e instanceof Error ? e.stack : undefined });
          fallbackToDashboard("シーケンス", sequenceId);
        });
      }
      return;
    }

    const viewMatch = matchPath("/view/edit/:viewId", location.pathname);
    if (viewMatch?.params.viewId) {
      const viewId = viewMatch.params.viewId;
      const tabId = makeTabId("view", viewId);
      const existing = getTabs().find((t) => t.id === tabId);
      if (existing) {
        setActiveTab(tabId);
      } else {
        loadView(viewId).then((v) => {
          if (v) {
            openTab({ id: tabId, type: "view", resourceId: viewId, label: v.id });
          } else {
            fallbackToDashboard("ビュー", viewId);
          }
        }).catch((e) => {
          recordError({ source: "manual", message: "loadView 失敗", stack: e instanceof Error ? e.stack : undefined });
          fallbackToDashboard("ビュー", viewId);
        });
      }
      return;
    }

    const viewDefinitionMatch = matchPath("/view-definition/edit/:viewDefinitionId", location.pathname);
    if (viewDefinitionMatch?.params.viewDefinitionId) {
      const viewDefinitionId = decodeURIComponent(viewDefinitionMatch.params.viewDefinitionId);
      const tabId = makeTabId("view-definition", viewDefinitionId);
      const existing = getTabs().find((t) => t.id === tabId);
      if (existing) {
        setActiveTab(tabId);
      } else {
        loadViewDefinition(viewDefinitionId).then((vd) => {
          if (vd) {
            openTab({ id: tabId, type: "view-definition", resourceId: viewDefinitionId, label: vd.name });
          } else {
            fallbackToDashboard("ビュー定義", viewDefinitionId);
          }
        }).catch((e) => {
          recordError({ source: "manual", message: "loadViewDefinition 失敗", stack: e instanceof Error ? e.stack : undefined });
          fallbackToDashboard("ビュー定義", viewDefinitionId);
        });
      }
      return;
    }

    // /workspace/select はタブ対象外 (フルスクリーン選択画面)
    if (location.pathname === "/workspace/select") return;

    // シングルトンタブ: list / workspace 系は resourceId="main" で 1 インスタンスのみ
    const singletonRoutes: ReadonlyArray<{ path: string; type: TabType; label: string }> = [
      { path: "/",                   type: "dashboard",          label: "ダッシュボード" },
      { path: "/screen/flow",        type: "screen-flow",        label: "画面フロー" },
      { path: "/screen/list",        type: "screen-list",        label: "画面一覧" },
      { path: "/table/list",         type: "table-list",         label: "テーブル一覧" },
      { path: "/table/er",           type: "er",                 label: "ER図" },
      { path: "/process-flow/list",  type: "process-flow-list",  label: "処理フロー一覧" },
      { path: "/extensions",         type: "extensions",         label: "拡張管理" },
      { path: "/conventions/catalog", type: "conventions-catalog", label: "規約カタログ" },
      { path: "/screen-items",       type: "screen-items",       label: "画面項目定義" },
      { path: "/sequence/list",      type: "sequence-list",      label: "シーケンス一覧" },
      { path: "/view/list",          type: "view-list",           label: "ビュー一覧" },
      { path: "/view-definition/list", type: "view-definition-list", label: "ビュー定義一覧" },
      { path: "/workspace/list",     type: "workspace-list",     label: "ワークスペース" },
    ];
    for (const { path, type, label } of singletonRoutes) {
      if (location.pathname === path) {
        const tabId = makeTabId(type, "main");
        const existing = getTabs().find((t) => t.id === tabId);
        if (existing) setActiveTab(tabId);
        else openTab({ id: tabId, type, resourceId: "main", label });
        return;
      }
    }
  }, [location.pathname]);

  // アクティブタブ → URL 同期
  // workspace 未選択中 (active=null) や /workspace/select 表示中は同期を停止する。
  // localStorage に残った activeTabId が design:xxx 等を指していると、guard が
  // /workspace/select に redirect → 直後に本 effect が /screen/design/xxx へ navigate
  // を上書き → guard が再度 redirect、というループ / flicker を起こすため。
  // workspace-list タブだけは select 画面からの誘導でも進入可能なので例外扱い。
  const activeTab = tabs.find((t) => t.id === activeTabId);
  useEffect(() => {
    if (!activeTab) return;
    if (location.pathname === "/workspace/select") return;
    if (workspaceState.active === null && !workspaceState.lockdown && activeTab.type !== "workspace-list") {
      return;
    }
    const expectedPath =
      activeTab.type === "design"             ? `/screen/design/${activeTab.resourceId}`
      : activeTab.type === "table"            ? `/table/edit/${activeTab.resourceId}`
      : activeTab.type === "action"           ? `/process-flow/edit/${activeTab.resourceId}`
      : activeTab.type === "sequence"         ? `/sequence/edit/${activeTab.resourceId}`
      : activeTab.type === "view"             ? `/view/edit/${activeTab.resourceId}`
      : activeTab.type === "view-definition"  ? `/view-definition/edit/${activeTab.resourceId}`
      : activeTab.type === "screen-flow"      ? "/screen/flow"
      : activeTab.type === "screen-list"      ? "/screen/list"
      : activeTab.type === "table-list"       ? "/table/list"
      : activeTab.type === "er"               ? "/table/er"
      : activeTab.type === "process-flow-list" ? "/process-flow/list"
      : activeTab.type === "extensions"       ? "/extensions"
      : activeTab.type === "conventions-catalog" ? "/conventions/catalog"
      : activeTab.type === "screen-items"     ? "/screen-items"
      : activeTab.type === "sequence-list"    ? "/sequence/list"
      : activeTab.type === "view-list"              ? "/view/list"
      : activeTab.type === "view-definition-list"   ? "/view-definition/list"
      : activeTab.type === "workspace-list"         ? "/workspace/list"
      : activeTab.type === "dashboard"              ? "/"
      : null;
    if (expectedPath && location.pathname !== expectedPath) {
      navigate(expectedPath, { replace: true });
    }
  }, [activeTabId, activeTab?.type, activeTab?.resourceId, workspaceState.active, workspaceState.lockdown, location.pathname]);

  const designTabs = tabs.filter((t) => t.type === "design");
  const activeIsDesign = activeTab?.type === "design";

  const handleCloseCrashedTab = (tabId: string) => {
    closeTab(tabId, true);
  };

  // 初回ハイドレーション中はルートを描画しない (#676 review):
  // workspaceState.loading=true の間に dashboard / 一覧系を描画すると、singleton stores
  // (flowStore / tableStore 等) が WS 未接続のうちに localStorage fallback で初期化されて
  // 旧 workspace のデータをキャッシュしてしまう。そのキャッシュは hydration 後も残り続け、
  // その状態から保存すると active workspace に旧データが上書きされる。
  // loading=false (= 初回 load 成功 or 失敗 or lockdown 確定) になるまで splash で遅延させる。
  if (workspaceState.loading) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", flexDirection: "column", gap: "8px",
        color: "var(--muted-text, #888)",
      }}>
        <i className="bi bi-hourglass-split" style={{ fontSize: "1.5rem" }} />
        <p style={{ margin: 0 }}>ワークスペース情報を読み込み中...</p>
      </div>
    );
  }

  // /workspace/select はフルスクリーンで表示 (ヘッダー・タブバーなし)
  if (location.pathname === "/workspace/select") {
    return <WorkspaceSelectView />;
  }

  return (
    <>
      <CommonHeader />
      <TabBar />

      {/* デザインタブ: 全て常時マウント、非アクティブは display:none */}
      {designTabs.map((tab) => (
        <div
          key={tab.id}
          style={{ display: activeTabId === tab.id ? "block" : "none", height: "calc(100vh - var(--common-header-h, 0px) - var(--tabbar-h, 0px))" }}
        >
          <ErrorBoundary
            context={{ tabId: tab.id, type: tab.type, resourceId: tab.resourceId }}
            fallback={(error, reset) => (
              <TabErrorFallback
                error={error}
                tabLabel={tab.label}
                onRetry={reset}
                onClose={() => handleCloseCrashedTab(tab.id)}
              />
            )}
          >
            <Designer
              screenId={tab.resourceId}
              screenName={tab.label}
              isActive={activeTabId === tab.id}
            />
          </ErrorBoundary>
        </div>
      ))}

      {/* 非デザインコンテンツ: 通常ルーティング */}
      {!activeIsDesign && (
        <ErrorBoundary
          resetKey={activeTabId}
          context={{ tabId: activeTabId, type: activeTab?.type, pathname: location.pathname }}
          fallback={(error, reset) => (
            <TabErrorFallback
              error={error}
              tabLabel={activeTab?.label ?? "コンテンツ"}
              onRetry={reset}
              onClose={() => {
                if (activeTabId) handleCloseCrashedTab(activeTabId);
              }}
            />
          )}
        >
          <Routes>
            <Route path="/" element={<DashboardView />} />
            <Route path="/screen/flow" element={<FlowEditor />} />
            <Route path="/screen/list" element={<ScreenListView />} />
            {/* design は designTabs 経由で別レンダーされるが、
                 URL→タブ同期 effect の解決中に一瞬こちらのブランチが描画される。
                 以前は element={null} で真っ白だったのを ResourceLoading に置換 (#124) */}
            <Route path="/screen/design/:screenId" element={<ResourceLoading kind="screen" />} />
            <Route path="/table/list" element={<TableListView />} />
            <Route path="/table/edit/:tableId" element={<TableEditor />} />
            <Route path="/table/er" element={<ErDiagram />} />
            <Route path="/process-flow/list" element={<ProcessFlowListView />} />
            <Route path="/process-flow/edit/:processFlowId" element={<ProcessFlowEditor />} />
            <Route path="/extensions" element={<ExtensionsPanel />} />
            <Route path="/conventions/catalog" element={<ConventionsCatalogView />} />
            <Route path="/screen-items" element={<ScreenItemsView />} />
            <Route path="/sequence/list" element={<SequenceListView />} />
            <Route path="/sequence/edit/:sequenceId" element={<SequenceEditor />} />
            <Route path="/view/list" element={<ViewListView />} />
            <Route path="/view/edit/:viewId" element={<ViewEditor />} />
            <Route path="/view-definition/list" element={<ViewDefinitionListView />} />
            <Route path="/view-definition/edit/:viewDefinitionId" element={<ViewDefinitionEditor />} />
            <Route path="/workspace/list" element={<WorkspaceListView />} />
          </Routes>
        </ErrorBoundary>
      )}
    </>
  );
}
