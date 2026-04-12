import { useParams, useNavigate } from "react-router-dom";
import { useMemo } from "react";
import { Designer } from "./Designer";
import { loadProject, screenStorageKey, screenExists } from "../store/flowStore";

export function ScreenDesigner() {
  const { screenId } = useParams<{ screenId: string }>();
  const navigate = useNavigate();

  const screen = useMemo(() => {
    if (!screenId) return null;
    const project = loadProject();
    if (!screenExists(project, screenId)) return null;
    return project.screens.find((s) => s.id === screenId) ?? null;
  }, [screenId]);

  if (!screenId || !screen) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", flexDirection: "column", gap: 16,
        fontFamily: "system-ui, sans-serif", color: "#64748b",
      }}>
        <i className="bi bi-exclamation-triangle" style={{ fontSize: 48, color: "#f59e0b" }} />
        <h2 style={{ margin: 0, color: "#334155" }}>画面が見��かりません</h2>
        <p>指定された画面ID は存在しないか、削除されています。</p>
        <button
          onClick={() => navigate("/")}
          style={{
            padding: "8px 20px", border: "none", borderRadius: 6,
            background: "#6366f1", color: "#fff", cursor: "pointer", fontSize: 14,
          }}
        >
          <i className="bi bi-arrow-left" /> フロー図に戻る
        </button>
      </div>
    );
  }

  return (
    <Designer
      storageKey={screenStorageKey(screenId)}
      screenName={screen.name}
      onBack={() => navigate("/")}
    />
  );
}
