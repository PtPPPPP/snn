/** A deliberately hand-set three-feature network, separate from the trainable 2→4→1 lab. */
export type Vec3 = readonly [number, number, number];
export type Camera = { yaw: number; pitch: number };
export const OBLIQUE: Camera = { yaw: -.62, pitch: .55 };
export const TOP: Camera = { yaw: -.62, pitch: Math.PI / 2 };
export const XOR_CORNERS = [
  { id: '00', input: [0, 0], target: 0 },
  { id: '10', input: [1, 0], target: 1 },
  { id: '01', input: [0, 1], target: 1 },
  { id: '11', input: [1, 1], target: 0 },
] as const;

export function features([x, y]: readonly [number, number]): Vec3 {
  return [Math.max(0, x), Math.max(0, y), Math.max(0, x + y - 1)];
}
export function outputScore(h: Vec3) { return h[0] + h[1] - 2 * h[2]; }
export function classify(h: Vec3) { return Number(outputScore(h) > .5); }
export function revealPosition(h: Vec3, t: number): Vec3 { return [h[0], h[1], h[2] * Math.max(0, Math.min(1, t))]; }
export function presentation(t: number, planeRequested: boolean) {
  const complete = t === 1;
  return { complete, predictionsVisible: complete, planeVisible: complete && planeRequested, attemptedLineVisible: t === 0 };
}
/** Intersection of h1+h2−2h3=.5 with the unit cube, cyclic polygon order. */
export const CLASSIFIER_PLANE: readonly Vec3[] = [[.5, 0, 0], [1, 0, .25], [1, 1, .75], [0, 1, .25], [0, .5, 0]];

/** Orthographic camera. Camera and reveal never alter network features or scores. */
export function project(point: Vec3, camera: Camera) {
  const [x, y, z] = [point[0] - .5, point[1] - .5, point[2] - .45];
  const u = Math.cos(camera.yaw) * x - Math.sin(camera.yaw) * y;
  const v = Math.sin(camera.yaw) * x + Math.cos(camera.yaw) * y;
  return { x: 170 + 114 * u, y: 143 + 114 * (Math.sin(camera.pitch) * v - Math.cos(camera.pitch) * z), depth: Math.cos(camera.pitch) * v + Math.sin(camera.pitch) * z };
}
export function orbit(camera: Camera, dx: number, dy: number): Camera {
  return { yaw: camera.yaw + dx, pitch: Math.max(.12, Math.min(Math.PI / 2, camera.pitch + dy)) };
}

export type RevealState = { t: number; planeRequested: boolean; celebrated: boolean; completionCount: number };
export const initialReveal = (): RevealState => ({ t: 0, planeRequested: true, celebrated: false, completionCount: 0 });
export function updateReveal(state: RevealState, patch: Partial<Pick<RevealState, 't' | 'planeRequested'>>): RevealState {
  const next = { ...state, ...patch };
  if (presentation(next.t, next.planeRequested).planeVisible && !next.celebrated) {
    next.celebrated = true;
    next.completionCount += 1;
  }
  return next;
}
