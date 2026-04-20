import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { StepCard } from "./StepCard";
import type { Step, StepType } from "../../types/action";
import type { ValidationError } from "../../utils/actionValidation";

interface SortableStepCardProps {
  step: Step;
  index: number;
  label: string;
  allSteps: Step[];
  tables: { id: string; name: string; logicalName: string }[];
  screens: { id: string; name: string }[];
  commonGroups: { id: string; name: string }[];
  onChange: (changes: Partial<Step>) => void;
  onCommit?: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onAddSubStep: (type: StepType) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onNavigateCommon: (refId: string) => void;
  defaultExpanded?: boolean;
  selected?: boolean;
  onHeaderClick?: (e: React.MouseEvent) => void;
  onIndent?: () => void;
  onOutdentSubStep?: (subStepId: string) => void;
  validationErrors?: ValidationError[];
  onAddMarker?: (body: string, kind?: "todo" | "question" | "attention" | "chat") => void;
}

export function SortableStepCard({ step, ...props }: SortableStepCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: step.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style}>
      <StepCard
        step={step}
        {...props}
        dragHandleListeners={listeners}
        dragHandleAttributes={attributes}
        depth={0}
      />
    </div>
  );
}
