export interface ScopeEntry {
  value: string;
  description?: string;
}

export interface CurrencyEntry {
  code: string;
  subunit?: number;
  roundingMode?: "floor" | "ceil" | "round";
  description?: string;
}

export interface TaxEntry {
  kind: "inclusive" | "exclusive";
  rate: number;
  roundingMode?: "floor" | "ceil" | "round";
  description?: string;
}

export interface AuthEntry {
  scheme: string;
  sessionStorage?: string;
  passwordHash?: string;
  description?: string;
}

export interface RoleEntry {
  name?: string;
  description?: string;
  permissions: string[];
  inherits?: string[];
}

export interface PermissionEntry {
  resource: string;
  action: string;
  scope?: "all" | "own" | "department";
  description?: string;
}

export interface DbEntry {
  engine?: string;
  namingConvention?: string;
  timestampColumns?: string[];
  logicalDeleteColumn?: string;
  description?: string;
}

export interface NumberingEntry {
  format: string;
  implementation?: string;
  description?: string;
}

export interface TxEntry {
  policy: string;
  description?: string;
}

export interface ExternalOutcomeDefaultEntry {
  outcome: "success" | "failure" | "timeout";
  action: "continue" | "abort" | "compensate";
  retry?: "none" | "fixed" | "exponential";
  description?: string;
}
