import type { Maturity } from "../../types/action";

interface Props {
  /** 未指定は "draft" 既定として扱う (docs/spec/process-flow-maturity.md §3) */
  maturity?: Maturity;
  /** 省略時のスタイル調整用: ステップカード内 inline / リスト行 standalone */
  size?: "sm" | "md";
}

/**
 * 成熟度バッジ (#184、docs/spec/process-flow-maturity.md §6.1)
 * - draft (🟡): 下書き
 * - provisional (🟠): 暫定
 * - committed (🟢): 確定
 */
const STYLE_MAP: Record<Maturity, { color: string; label: string; title: string }> = {
  draft: { color: "#f59e0b", label: "●", title: "下書き (draft)" },
  provisional: { color: "#f97316", label: "●", title: "暫定 (provisional)" },
  committed: { color: "#22c55e", label: "●", title: "確定 (committed)" },
};

export function MaturityBadge({ maturity, size = "sm" }: Props) {
  const m: Maturity = maturity ?? "draft";
  const style = STYLE_MAP[m];
  const fontSize = size === "sm" ? 10 : 12;
  return (
    <span
      className="maturity-badge"
      title={style.title}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding: "0 4px",
        color: style.color,
        fontSize,
        lineHeight: 1,
        flexShrink: 0,
      }}
      aria-label={`成熟度: ${style.title}`}
    >
      <span style={{ fontSize: size === "sm" ? 8 : 10 }}>{style.label}</span>
    </span>
  );
}
