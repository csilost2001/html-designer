import type { ReactNode } from "react";
import "../styles/commonHeader.css";

interface Props {
  notification?: ReactNode;
  userName?: string;
}

export function CommonHeader({ notification, userName }: Props) {
  return (
    <header className="common-header">
      <div className="common-header-left">
        <i className="bi bi-palette2 common-header-logo" />
        <span className="common-header-title">業務システム デザイナー</span>
      </div>
      <div className="common-header-center">
        {notification}
      </div>
      <div className="common-header-right">
        <span className="common-header-user">
          <i className="bi bi-person-circle" />
          <span className="common-header-user-label">{userName ?? "ゲスト"}</span>
        </span>
      </div>
    </header>
  );
}
