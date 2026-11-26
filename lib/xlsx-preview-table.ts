export type ParsedSheetTable = {
  name: string;
  columns: string[];
  rows: Array<{
    rowNumber: number;
    cells: Record<string, { ref: string; value: string }>;
  }>;
};

function colToIndex(col: string): number {
  let n = 0;
  for (let i = 0; i < col.length; i += 1) {
    n = n * 26 + (col.charCodeAt(i) - 64);
  }
  return n;
}

/**
 * Parses the deterministic `[Sheet: Name]` / `A1: value` text extracted by
 * `xlsx-parser.mjs` into structured read-only sheet tables so users can
 * inspect cell coordinates and values before downloading.
 */
export function parseExtractedWorkbook(content: string): ParsedSheetTable[] {
  if (typeof content !== "string" || !content.includes("[Sheet: ")) return [];
  const sheets: ParsedSheetTable[] = [];
  const blocks = content.split(/\[Sheet:\s*([^\]]+)\]\r?\n/);
  for (let i = 1; i < blocks.length; i += 2) {
    const name = blocks[i].trim();
    const body = blocks[i + 1] ?? "";
    const colSet = new Set<string>();
    const rowMap = new Map<number, Record<string, { ref: string; value: string }>>();
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("[TRUNCATED]")) continue;
      const match = /^([A-Z]{1,3})(\d+):\s*(.*)$/.exec(line);
      if (!match) continue;
      const [, col, rowStr, val] = match;
      const rowNum = Number.parseInt(rowStr, 10);
      if (!Number.isFinite(rowNum) || rowNum <= 0) continue;
      colSet.add(col);
      const rowCells = rowMap.get(rowNum) ?? {};
      rowCells[col] = { ref: `${col}${rowNum}`, value: val };
      rowMap.set(rowNum, rowCells);
    }
    if (rowMap.size === 0) continue;
    const columns = [...colSet].sort((a, b) => colToIndex(a) - colToIndex(b)).slice(0, 26);
    const rows = [...rowMap.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(0, 100)
      .map(([rowNumber, cells]) => ({ rowNumber, cells }));
    sheets.push({ name, columns, rows });
  }
  return sheets;
}
