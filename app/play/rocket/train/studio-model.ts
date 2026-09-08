export type Cell = { layer: number; row: number; col: number };
export const boards = [
  { x: 166, y: 94, w: 126, h: 256, rows: 128, cols: 7 },
  { x: 394, y: 94, w: 256, h: 256, rows: 128, cols: 128 },
  { x: 762, y: 94, w: 38, h: 256, rows: 1, cols: 128 },
];
export function cellBox(cell: Cell) {
  const b = boards[cell.layer];
  const output = cell.layer === 2;
  const width = output ? b.w : b.w / b.cols, height = b.h / 128;
  return { x: b.x + (output ? 0 : cell.col) * width, y: b.y + (output ? cell.col : cell.row) * height, width, height };
}
export function hitCell(layer: number, x: number, y: number): Cell {
  const b = boards[layer], row = Math.max(0, Math.min(127, Math.floor((y - b.y) / b.h * 128)));
  return { layer, row: layer === 2 ? 0 : row, col: layer === 2 ? row : Math.max(0, Math.min(b.cols - 1, Math.floor((x - b.x) / b.w * b.cols))) };
}
export function dependencies(cell: Cell): Cell[] {
  if (cell.layer === 2) return [];
  if (cell.layer === 1) return [{ layer: 2, row: 0, col: cell.row }];
  return Array.from({ length: 128 }, (_,row) => ({ layer: 1, row, col: cell.row }));
}
export function playback(time: number, rounds: number) {
  if (time >= rounds * 12) return { round: rounds - 1, phase: 2, part: 1, layer: 0 };
  const round = Math.min(rounds - 1, Math.max(0, Math.floor(time / 12)));
  const local = Math.max(0, Math.min(11.9999, time - round * 12));
  const phase = local < 4 ? 0 : local < 8 ? 1 : 2;
  const part = (local % 4) / 4;
  return { round, phase, part, layer: phase === 0 ? Math.min(2, Math.floor(part * 3)) : 2 - Math.min(2, Math.floor(part * 3)) };
}
export function revealFor(layer: number, phase: number, part: number) {
  return phase === 2 ? Math.max(0, Math.min(1, part * 3 - (2 - layer))) : 0;
}
export function cellBlend(cell: Cell, reveal: number) {
  const index = cell.layer === 2 ? cell.col : cell.col * 128 + cell.row;
  const count = boards[cell.layer].cols * boards[cell.layer].rows;
  return Math.max(0, Math.min(1, reveal * count - index));
}
export function heat(value: number, limit: number) {
  const palette = value < 0 ? [[236,240,241],[119,192,191],[62,132,160],[69,86,148]] : [[236,240,241],[238,203,134],[220,139,101],[179,85,112]];
  const t = Math.min(1, Math.abs(value) / Math.max(limit, 1e-8)) * 3, n = Math.min(2, Math.floor(t));
  return `rgb(${palette[n].map((v,i) => Math.round(v + (palette[n+1][i]-v)*(t-n))).join(',')})`;
}
