export interface I18nConfig {
  supportedLocales: string[];
  defaultLocale: string;
  dateFormat?: Record<string, string>;
  timeFormat?: Record<string, string>;
  currencyDisplay?: Record<string, "symbol" | "code" | "name">;
  numberGrouping?: Record<string, boolean>;
}

export interface MessageTemplate {
  template: string;
  params?: string[];
  locales?: Record<string, string>;
  description?: string;
}

export interface ScopeEntry {
  value: string;
  description?: string;
  /** true = このエントリが project-wide ambient default (#369) */
  default?: boolean;
}

export interface CurrencyEntry {
  code: string;
  subunit?: number;
  roundingMode?: "floor" | "ceil" | "round";
  description?: string;
  /** true = このエントリが project-wide ambient default (#369) */
  default?: boolean;
}

export interface TaxEntry {
  kind: "inclusive" | "exclusive";
  rate: number;
  roundingMode?: "floor" | "ceil" | "round";
  description?: string;
  /** true = このエントリが project-wide ambient default (#369) */
  default?: boolean;
}

export interface AuthEntry {
  scheme: string;
  sessionStorage?: string;
  passwordHash?: string;
  description?: string;
  /** true = このエントリが project-wide ambient default (#369) */
  default?: boolean;
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
  /** true = このエントリが project-wide ambient default (#369) */
  default?: boolean;
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
