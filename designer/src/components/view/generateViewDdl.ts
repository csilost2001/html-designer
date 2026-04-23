import type { ViewDefinition } from "../../types/view";

export function generateViewDdl(view: ViewDefinition): string {
  const lines: string[] = [];

  lines.push(`CREATE OR REPLACE VIEW ${view.id} AS`);

  if (view.selectStatement.trim()) {
    lines.push(view.selectStatement);
  } else {
    lines.push("-- SELECT 文を入力してください");
  }

  lines[lines.length - 1] = lines[lines.length - 1].trimEnd().replace(/;+$/, "") + ";";

  if (view.description) {
    lines.push(`\nCOMMENT ON VIEW ${view.id} IS '${view.description.replace(/'/g, "''")}';`);
  }

  return lines.join("\n");
}
