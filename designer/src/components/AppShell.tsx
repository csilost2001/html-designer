import { useEffect, useState } from "react";
import { Routes, Route, useLocation, useNavigate, matchPath } from "react-router-dom";
import { FlowEditor } from "./flow/FlowEditor";
import { TableListView } from "./table/TableListView";
import { TableEditor } from "./table/TableEditor";
import { ErDiagram } from "./table/ErDiagram";
import { ActionListView } from "./action/ActionListView";
import { ActionEditor } from "./action/ActionEditor";
import { Designer } from "./Designer";
import { DashboardView } from "./dashboard/DashboardView";
import { TabBar } from "./TabBar";
import { CommonHeader } from "./CommonHeader";
import { loadProject } from "../store/flowStore";
import { loadTable } from "../store/tableStore";
import { loadActionGroup } from "../store/actionStore";
import {
  getTabs,
  getActiveTabId,
  subscribe,
  openTab,
  setActiveTab,
  makeTabId,
  type TabItem,
  type TabType,
} from "../store/tabStore";
import { useTabKeyboard } from "../hooks/useTabKeyboard";

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
  useTabKeyboard();

  // CSS variables でヘッダー・タブバーの高さを各コンポーネントに伝える
  useEffect(() => {
    document.documentElement.style.setProperty("--common-header-h", "40px");
  }, []);

  useEffect(() => {
    const h = tabs.length > 0 ? "32px" : "0px";
    document.documentElement.style.setProperty("--tabbar-h", h);
  }, [tabs.length]);

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
          }
        }).catch(console.error);
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
            openTab({ id: tabId, type: "table", resourceId: tableId, label: table.logicalName ?? table.name });
          }
        }).catch(console.error);
      }
      return;
    }

    const actionMatch = matchPath("/process-flow/edit/:actionGroupId", location.pathname);
    if (actionMatch?.params.actionGroupId) {
      const actionGroupId = actionMatch.params.actionGroupId;
      const tabId = makeTabId("action", actionGroupId);
      const existing = getTabs().find((t) => t.id === tabId);
      if (existing) {
        setActiveTab(tabId);
      } else {
        loadActionGroup(actionGroupId).then((ag) => {
          if (ag) {
            openTab({ id: tabId, type: "action", resourceId: actionGroupId, label: ag.name });
          }
        }).catch(console.error);
      }
      return;
    }

    // シングルトンタブ: list / workspace 系は resourceId="main" で 1 インスタンスのみ
    const singletonRoutes: ReadonlyArray<{ path: string; type: TabType; label: string }> = [
      { path: "/",                   type: "dashboard",          label: "ダッシュボード" },
      { path: "/screen/flow",        type: "screen-flow",        label: "画面フロー" },
      { path: "/table/list",         type: "table-list",         label: "テーブル一覧" },
      { path: "/table/er",           type: "er",                 label: "ER図" },
      { path: "/process-flow/list",  type: "process-flow-list",  label: "処理フロー一覧" },
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
  const activeTab = tabs.find((t) => t.id === activeTabId);
  useEffect(() => {
    if (!activeTab) return;
    const expectedPath =
      activeTab.type === "design"             ? `/screen/design/${activeTab.resourceId}`
      : activeTab.type === "table"            ? `/table/edit/${activeTab.resourceId}`
      : activeTab.type === "action"           ? `/process-flow/edit/${activeTab.resourceId}`
      : activeTab.type === "screen-flow"      ? "/screen/flow"
      : activeTab.type === "table-list"       ? "/table/list"
      : activeTab.type === "er"               ? "/table/er"
      : activeTab.type === "process-flow-list" ? "/process-flow/list"
      : activeTab.type === "dashboard"        ? "/"
      : null;
    if (expectedPath && location.pathname !== expectedPath) {
      navigate(expectedPath, { replace: true });
    }
  }, [activeTabId, activeTab?.type, activeTab?.resourceId]);

  const designTabs = tabs.filter((t) => t.type === "design");
  const activeIsDesign = activeTab?.type === "design";

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
          <Designer
            screenId={tab.resourceId}
            screenName={tab.label}
            isActive={activeTabId === tab.id}
          />
        </div>
      ))}

      {/* 非デザインコンテンツ: 通常ルーティング */}
      {!activeIsDesign && (
        <Routes>
          <Route path="/" element={<DashboardView />} />
          <Route path="/screen/flow" element={<FlowEditor />} />
          <Route path="/screen/design/:screenId" element={null} />
          <Route path="/table/list" element={<TableListView />} />
          <Route path="/table/edit/:tableId" element={<TableEditor />} />
          <Route path="/table/er" element={<ErDiagram />} />
          <Route path="/process-flow/list" element={<ActionListView />} />
          <Route path="/process-flow/edit/:actionGroupId" element={<ActionEditor />} />
        </Routes>
      )}
    </>
  );
}
