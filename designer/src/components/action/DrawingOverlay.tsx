/**
 * 赤線 free-form マーカー (#261)
 *
 * ActionEditor 上に被せる SVG オーバーレイ。
 * - drawing=true のとき pointer-events:auto で描画を受け付ける (マウス追跡で SVG path を生成)
 * - 既存の shape 付きマーカーは常に表示 (pointer-events:none で下の UI 操作を邪魔しない)
 * - 座標は container の bounding rect に対する 0-100 % で保存 (リサイズ耐性)
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Marker } from "../../types/action";

interface Props {
  markers: Marker[];
  drawing: boolean;
  /** 完成した path を受け取り、prompt で body を聞いて marker を作る */
  onDrawComplete: (shape: { type: "path"; d: string }) => void;
}

export function DrawingOverlay({ markers, drawing, onDrawComplete }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [currentPath, setCurrentPath] = useState<string>("");
  const isDrawingRef = useRef(false);

  // 描画モード終了時に in-progress をクリア
  useEffect(() => {
    if (!drawing) {
      isDrawingRef.current = false;
      setCurrentPath("");
    }
  }, [drawing]);

  const toPercent = useCallback((clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    return { x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) };
  }, []);

  const onPointerDown = (e: React.PointerEvent) => {
    if (!drawing) return;
    const { x, y } = toPercent(e.clientX, e.clientY);
    isDrawingRef.current = true;
    setCurrentPath(`M ${x.toFixed(2)} ${y.toFixed(2)}`);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing || !isDrawingRef.current) return;
    const { x, y } = toPercent(e.clientX, e.clientY);
    setCurrentPath((p) => `${p} L ${x.toFixed(2)} ${y.toFixed(2)}`);
  };

  const onPointerUp = () => {
    if (!drawing || !isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (currentPath && currentPath.includes("L")) {
      onDrawComplete({ type: "path", d: currentPath });
    }
    setCurrentPath("");
  };

  // 既存 shape の表示 (pointer-events:none)
  const existingShapes = markers
    .filter((m) => m.shape && m.shape.type === "path" && !m.resolvedAt)
    .map((m) => ({ id: m.id, shape: m.shape!, body: m.body, kind: m.kind }));

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: drawing ? "auto" : "none",
    cursor: drawing ? "crosshair" : "default",
    zIndex: 30,
  };

  return (
    <svg
      ref={svgRef}
      className="drawing-overlay"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      style={containerStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
    >
      {/* 既存 shape (非インタラクティブ) */}
      {existingShapes.map((s) => (
        <g key={s.id}>
          <path
            d={s.shape.d}
            stroke={s.shape.color ?? "#ef4444"}
            strokeWidth={s.shape.strokeWidth ?? 2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.75}
            vectorEffect="non-scaling-stroke"
          >
            <title>{`[${s.kind}] ${s.body}`}</title>
          </path>
        </g>
      ))}
      {/* 描画中の path */}
      {currentPath && (
        <path
          d={currentPath}
          stroke="#ef4444"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      )}
    </svg>
  );
}
