/**
 * ダッシュボード画面（placeholder）
 *
 * PR-4 で react-grid-layout + panelRegistry を導入し、パネル 3 種を表示する。
 * 本 PR-3 では骨組みだけを提供する。
 */
import "../../styles/dashboard.css";

export function DashboardView() {
  return (
    <div className="dashboard-view">
      <div className="dashboard-header">
        <h1 className="dashboard-title">
          <i className="bi bi-speedometer2" /> ダッシュボード
        </h1>
        <p className="dashboard-subtitle">プロジェクト全体の状況を俯瞰</p>
      </div>

      <div className="dashboard-placeholder">
        <i className="bi bi-grid-3x3-gap" />
        <p>パネル実装準備中（Issue #86 PR-4 以降で追加予定）</p>
      </div>
    </div>
  );
}
