import { useNavigate, useLocation } from "react-router-dom";

interface Props {
  projectName: string;
}

export function TableTopbar({ projectName }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const isFlow = location.pathname === "/";
  const isTable = location.pathname.startsWith("/tables");

  return (
    <header className="flow-topbar">
      <div className="flow-topbar-left">
        <i className="bi bi-diagram-3 topbar-logo" />
        <span className="flow-topbar-title">{projectName}</span>
        <nav className="global-nav">
          <button
            className={`global-nav-btn${isFlow ? " active" : ""}`}
            onClick={() => navigate("/")}
          >
            <i className="bi bi-diagram-3" /> 画面フロー
          </button>
          <button
            className={`global-nav-btn${isTable ? " active" : ""}`}
            onClick={() => navigate("/tables")}
          >
            <i className="bi bi-table" /> テーブル設計
          </button>
        </nav>
      </div>
      <div className="flow-topbar-right" />
    </header>
  );
}
