/**
 * 赤線 free-form マーカー オーバーレイ (#261)
 *
 * ActionEditor 上に被せる SVG オーバーレイ。描画モード ON で:
 * - ペンツール: ドラッグで自由描画。複数ストロークは path "d" 内で M 区切り合体
 * - 消しゴムツール: 既存 shape 付き marker をクリックで削除
 * - 確定ボタン: 現在のストローク群を 1 マーカー (kind=todo) として起票
 * - キャンセルボタン: ストロークを破棄して描画モード終了
 *
 * 座標は container の bounding rect に対する 0-100 % で保存 (リサイズ耐性)。
 * SVG path "d" が複数の M セグメントを含む = 複数ストロークがまとまった 1 marker。
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Marker } from "../../types/action";

type Tool = "pen" | "eraser";

interface Props {
  markers: Marker[];
  drawing: boolean;
  /** 完成した shape を受け取り、body を聞いて marker を作る */
  onCommitStrokes: (shape: { type: "path"; d: string }) => void;
  /** eraser で既存 marker を消去 */
  onEraseMarker: (markerId: string) => void;
  /** 描画モード終了時のコールバック (キャンセル時、または commit 完了後) */
  onExitDrawing: () => void;
}

export function DrawingOverlay({ markers, drawing, onCommitStrokes, onEraseMarker, onExitDrawing }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [tool, setTool] = useState<Tool>("pen");
  const [strokes, setStrokes] = useState<string[]>([]); // 完了した個別ストローク (各々 "M ... L ... L ...")
  const [currentStroke, setCurrentStroke] = useState<string>(""); // 描画中
  const isDrawingRef = useRef(false);

  // 描画モード終了時に state リセット
  useEffect(() => {
    if (!drawing) {
      isDrawingRef.current = false;
      setStrokes([]);
      setCurrentStroke("");
      setTool("pen");
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
    if (!drawing || tool !== "pen") return;
    const { x, y } = toPercent(e.clientX, e.clientY);
    isDrawingRef.current = true;
    setCurrentStroke(`M ${x.toFixed(2)} ${y.toFixed(2)}`);
    (e.target as Element).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!drawing || tool !== "pen" || !isDrawingRef.current) return;
    const { x, y } = toPercent(e.clientX, e.clientY);
    setCurrentStroke((p) => `${p} L ${x.toFixed(2)} ${y.toFixed(2)}`);
  };

  const onPointerUp = () => {
    if (!drawing || tool !== "pen" || !isDrawingRef.current) return;
    isDrawingRef.current = false;
    if (currentStroke && currentStroke.includes("L")) {
      setStrokes((s) => [...s, currentStroke]);
    }
    setCurrentStroke("");
  };

  const commit = () => {
    if (strokes.length === 0) { onExitDrawing(); return; }
    onCommitStrokes({ type: "path", d: strokes.join(" ") });
    // ActionEditor 側が drawing=false にするので useEffect でリセットされる
  };

  const cancel = () => {
    setStrokes([]);
    setCurrentStroke("");
    onExitDrawing();
  };

  const undoLastStroke = () => {
    setStrokes((s) => s.slice(0, -1));
  };

  // 既存の shape 付き marker (表示 + eraser クリックターゲット)
  const existingShapes = markers
    .filter((m) => m.shape && m.shape.type === "path" && !m.resolvedAt)
    .map((m) => ({ id: m.id, shape: m.shape!, body: m.body, kind: m.kind }));

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    pointerEvents: drawing ? "auto" : "none",
    cursor: drawing ? (tool === "pen" ? "crosshair" : "not-allowed") : "default",
    zIndex: 30,
  };

  return (
    <>
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
        {/* 既存 shape */}
        {existingShapes.map((s) => (
          <path
            key={s.id}
            className="drawing-existing-shape"
            d={s.shape.d}
            stroke={s.shape.color ?? "#ef4444"}
            strokeWidth={s.shape.strokeWidth ?? 2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.75}
            vectorEffect="non-scaling-stroke"
            style={{ pointerEvents: drawing && tool === "eraser" ? "stroke" : "none", cursor: drawing && tool === "eraser" ? "pointer" : "default" }}
            onClick={(e) => {
              if (drawing && tool === "eraser") {
                e.stopPropagation();
                onEraseMarker(s.id);
              }
            }}
          >
            <title>{`[${s.kind}] ${s.body}${drawing && tool === "eraser" ? " (クリックで削除)" : ""}`}</title>
          </path>
        ))}
        {/* 確定済みストローク (まだ commit 前、描画セッション内) */}
        {strokes.map((s, i) => (
          <path
            key={`s-${i}`}
            d={s}
            stroke="#ef4444"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {/* 描画中の path */}
        {currentStroke && (
          <path
            d={currentStroke}
            stroke="#ef4444"
            strokeWidth={2}
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>

      {/* ツールバー (drawing 時のみ表示) */}
      {drawing && (
        <div className="drawing-toolbar">
          <div className="drawing-toolbar-group">
            <button
              type="button"
              className={`drawing-toolbar-btn ${tool === "pen" ? "active" : ""}`}
              onClick={() => setTool("pen")}
              title="ペン (ドラッグで描画)"
            >
              <i className="bi bi-pencil-fill" />
            </button>
            <button
              type="button"
              className={`drawing-toolbar-btn ${tool === "eraser" ? "active" : ""}`}
              onClick={() => setTool("eraser")}
              title="消しゴム (既存の赤線をクリックで削除)"
            >
              <i className="bi bi-eraser-fill" />
            </button>
          </div>
          <div className="drawing-toolbar-group">
            <button
              type="button"
              className="drawing-toolbar-btn"
              onClick={undoLastStroke}
              disabled={strokes.length === 0}
              title={`1 ストローク戻す (現在 ${strokes.length})`}
            >
              <i className="bi bi-arrow-counterclockwise" />
            </button>
          </div>
          <div className="drawing-toolbar-group">
            <span className="drawing-toolbar-info">
              {strokes.length} ストローク
            </span>
            <button
              type="button"
              className="drawing-toolbar-btn drawing-toolbar-commit"
              onClick={commit}
              disabled={strokes.length === 0}
              title="ストロークを確定して marker 起票"
            >
              <i className="bi bi-check-lg" /> 確定
            </button>
            <button
              type="button"
              className="drawing-toolbar-btn drawing-toolbar-cancel"
              onClick={cancel}
              title="破棄して描画モード終了"
            >
              <i className="bi bi-x-lg" />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
