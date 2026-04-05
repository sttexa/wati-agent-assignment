// ============================================================
// Shared CLI utilities
// ============================================================

type ConfirmHandler = (description: string) => Promise<boolean>;

let confirmHandler: ConfirmHandler | null = null;

function truncateCell(value: string, width: number): string {
  if (value.length <= width) return value.padEnd(width, " ");
  if (width <= 3) return value.slice(0, width);
  return value.slice(0, width - 3) + "...";
}

/**
 * Register the confirmation implementation from the main CLI.
 * This lets write confirmations reuse the same readline instance as the REPL.
 */
export function setConfirmHandler(handler: ConfirmHandler): void {
  confirmHandler = handler;
}

/**
 * Print a confirmation prompt and wait for a single line from the active CLI.
 * Returns true only if the user types exactly "y" (case-insensitive).
 */
export async function promptConfirm(description: string): Promise<boolean> {
  if (!confirmHandler) {
    throw new Error("Confirmation handler has not been initialized.");
  }
  return confirmHandler(description);
}

/**
 * Format rows into fixed-width text columns for terminal output.
 */
export function formatColumns(
  headers: string[],
  rows: string[][],
  widths: number[]
): string {
  const renderRow = (cells: string[]) =>
    cells.map((cell, index) => truncateCell(cell, widths[index])).join("  ");

  const header = renderRow(headers);
  const divider = widths.map((width) => "-".repeat(width)).join("  ");
  const body = rows.map(renderRow).join("\n");

  return [header, divider, body].filter(Boolean).join("\n");
}
