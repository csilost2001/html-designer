import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { clearActiveTab, getTabs, getActiveTabId } from "../store/tabStore";
import "../styles/headerMenu.css";

type MenuItem = {
  id: string;
  label: string;
  icon: string;
  route: string;
  /** active 判定に一致する pathname（完全一致） */
  activePaths?: string[];
  /** active 判定に一致する pathname の接頭辞（例: "/table/edit/" で編集ページも active にする） */
  activePrefixes?: string[];
  disabled?: boolean;
};

const MENU_ITEMS: MenuItem[] = [
  {
    id: "screen-flow", label: "画面フロー", icon: "bi-diagram-3", route: "/screen/flow",
    activePaths: ["/screen/flow"], activePrefixes: ["/screen/design/"],
  },
  {
    id: "table-list", label: "テーブル一覧", icon: "bi-table", route: "/table/list",
    activePaths: ["/table/list"], activePrefixes: ["/table/edit/"],
  },
  {
    id: "er", label: "ER図", icon: "bi-share", route: "/table/er",
    activePaths: ["/table/er"],
  },
  {
    id: "process-flow", label: "処理フロー一覧", icon: "bi-lightning", route: "/process-flow/list",
    activePaths: ["/process-flow/list"], activePrefixes: ["/process-flow/edit/"],
  },
];

const DASHBOARD_ITEM: MenuItem = {
  id: "dashboard",
  label: "ダッシュボード",
  icon: "bi-speedometer2",
  route: "/",
  activePaths: ["/"],
};

function isDesignTabActive(): boolean {
  const activeId = getActiveTabId();
  return getTabs().some((t) => t.id === activeId && t.type === "design");
}

export function HeaderMenu() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const handleSelect = (route: string) => {
    // デザインタブがアクティブな場合は解除して非デザインルートを表示できるようにする
    if (isDesignTabActive()) {
      clearActiveTab();
    }
    navigate(route);
    setOpen(false);
  };

  const isActive = (item: MenuItem) => {
    if (item.activePaths?.includes(location.pathname)) return true;
    return item.activePrefixes?.some((p) => location.pathname.startsWith(p)) ?? false;
  };

  return (
    <div className="header-menu" ref={menuRef}>
      <button
        className={`header-menu-btn${open ? " open" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title="メニュー"
        aria-haspopup="true"
        aria-expanded={open}
      >
        <i className="bi bi-list" />
      </button>

      {open && (
        <div className="header-menu-dropdown" role="menu">
          <div className="header-menu-section-label">ナビゲーション</div>

          <button
            key={DASHBOARD_ITEM.id}
            className={`header-menu-item${isActive(DASHBOARD_ITEM) ? " active" : ""}`}
            onClick={() => handleSelect(DASHBOARD_ITEM.route)}
            role="menuitem"
          >
            <i className={`bi ${DASHBOARD_ITEM.icon}`} />
            <span>{DASHBOARD_ITEM.label}</span>
          </button>

          <div className="header-menu-separator" />

          {MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              className={`header-menu-item${isActive(item) ? " active" : ""}`}
              onClick={() => handleSelect(item.route)}
              role="menuitem"
            >
              <i className={`bi ${item.icon}`} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
