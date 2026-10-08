import { VALUE_COLOR_STOPS } from './tokens.ts';
export { VALUE_COLOR_STOPS };
const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));

/** Shared fixed [-2, 2] scale. Float RGB is continuous; only final display is 8-bit quantized. */
export function valueColorRgb(value: number): number[] {
  if (!Number.isFinite(value)) throw new RangeError('Numeric color requires a finite value');
  const v = Math.max(-2, Math.min(2, value));
  const next = VALUE_COLOR_STOPS.findIndex(stop => stop.value >= v);
  if (next === 0) return rgb(VALUE_COLOR_STOPS[0].color);
  const lo = VALUE_COLOR_STOPS[next - 1], hi = VALUE_COLOR_STOPS[next];
  const t = (v - lo.value) / (hi.value - lo.value), a = rgb(lo.color), b = rgb(hi.color);
  return a.map((c, i) => c + (b[i] - c) * t);
}
export function valueColor(value: number): string {
  return '#' + valueColorRgb(value).map(c => Math.round(c).toString(16).padStart(2, '0')).join('');
}
