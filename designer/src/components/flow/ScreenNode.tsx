import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { ScreenNode as ScreenNodeData } from "../../types/flow";
import { SCREEN_TYPE_LABELS, SCREEN_TYPE_ICONS } from "../../types/flow";

type ScreenNodeProps = NodeProps & {
  data: ScreenNodeData;
  selected?: boolean;
};

function ScreenNodeComponent({ data, selected }: ScreenNodeProps) {
  const icon = SCREEN_TYPE_ICONS[data.type] ?? "bi-circle";
  const typeLabel = SCREEN_TYPE_LABELS[data.type] ?? data.type;

  return (
    <>
      <Handle type="target" position={Position.Top} id="top" />
      <Handle type="target" position={Position.Left} id="left" />
      <div className={`screen-node${selected ? " selected" : ""}`}>
        <div className="screen-node-header">
          <i className={`bi ${icon} screen-node-icon`} />
          <span className="screen-node-name">{data.name}</span>
        </div>
        <div className="screen-node-body">
          <span className="screen-node-type">
            {typeLabel}
          </span>
          {data.path && (
            <div className="screen-node-path">{data.path}</div>
          )}
          <div className={`screen-node-design-badge${data.hasDesign ? "" : " empty"}`}>
            <i className={`bi ${data.hasDesign ? "bi-brush-fill" : "bi-brush"}`} />
            {data.hasDesign ? "デザイン済み" : "未デザイン"}
          </div>
        </div>
      </div>
      <Handle type="source" position={Position.Bottom} id="bottom" />
      <Handle type="source" position={Position.Right} id="right" />
    </>
  );
}

export default memo(ScreenNodeComponent);
