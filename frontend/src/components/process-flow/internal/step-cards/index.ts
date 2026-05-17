// @ts-nocheck -- StepCard と同じ legacy/v3 union 緩和理由 (#1016)
// Phase-2 (#1145): StepCard.tsx の kind 別 body sub-component の barrel export。

export { ValidationStepCardBody } from "./ValidationStepCardBody";
export { DbAccessStepCardBody } from "./DbAccessStepCardBody";
export { ExternalSystemStepCardBody } from "./ExternalSystemStepCardBody";
export { CommonProcessStepCardBody } from "./CommonProcessStepCardBody";
export { ComputeStepCardBody } from "./ComputeStepCardBody";
export { ReturnStepCardBody } from "./ReturnStepCardBody";
export { ScreenTransitionStepCardBody } from "./ScreenTransitionStepCardBody";
export { DisplayUpdateStepCardBody } from "./DisplayUpdateStepCardBody";
export { BranchStepCardBody } from "./BranchStepCardBody";
export { LoopStepCardBody } from "./LoopStepCardBody";
export { LogStepCardBody } from "./LogStepCardBody";
export { AuditStepCardBody } from "./AuditStepCardBody";
export { TransactionScopeStepCardBody } from "./TransactionScopeStepCardBody";
export { JumpStepCardBody } from "./JumpStepCardBody";
export { WorkflowStepCardBody } from "./WorkflowStepCardBody";
