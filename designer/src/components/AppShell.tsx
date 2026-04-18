import { useEffect, useState } from "react";
import { Routes, Route, useLocation, useNavigate, matchPath } from "react-router-dom";
import { FlowEditor } from "./flow/FlowEditor";
import { TableListView } from "./table/TableListView";
import { TableEditor } from "./table/TableEditor";
import { ErDiagram } from "./table/ErDiagram";
import { ActionListView } from "./action/ActionListView";
import { ActionEditor } from "./action/ActionEditor";
import { Designer } from "./Designer";
import { TabBar } from "./TabBar";
import { CommonHeader } from "./CommonHeader";
import { loadProject } from "../store/flowStore";
import { loadTable } from "../store/tableStore";
import {
  getTabs,
  getActiveTabId,
  subscribe,
  openTab,
  setActiveTab,
  makeTabId,
  type TabItem,
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
    const designMatch = matchPath("/design/:screenId", location.pathname);
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

    const tableMatch = matchPath("/tables/:tableId", location.pathname);
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
    }
  }, [location.pathname]);

  // アクティブタブ → URL 同期
  const activeTab = tabs.find((t) => t.id === activeTabId);
  useEffect(() => {
    if (!activeTab) return;
    const expectedPath =
      activeTab.type === "design"
        ? `/design/${activeTab.resourceId}`
        : activeTab.type === "table"
        ? `/tables/${activeTab.resourceId}`
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
          <Route path="/" element={<FlowEditor />} />
          <Route path="/tables" element={<TableListView />} />
          <Route path="/tables/:tableId" element={<TableEditor />} />
          <Route path="/er" element={<ErDiagram />} />
          <Route path="/actions" element={<ActionListView />} />
          <Route path="/actions/:actionGroupId" element={<ActionEditor />} />
          <Route path="/design/:screenId" element={null} />
        </Routes>
      )}
    </>
  );
}
