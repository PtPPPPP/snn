// SnnHeroArt — "DIGITAL PLOTTER / NEURAL BLUEPRINT"
//
// The old radial-network / concentric-orbit HUD is gone. This is a single
// master-timeline story: a blueprint sheet initialises, then an invisible
// plotter head draws S, N, N stroke by stroke (real stroke-dashoffset path
// drawing), then neural connections are plotted one by one, nodes spawn only
// where the line has already arrived, three nodes activate lime left → mid →
// right, the completed network holds for a moment, then everything retracts
// (erase) and the loop restarts seamlessly — no sudden flashes.
//
// Technique: React + inline SVG + pure CSS. Every element animates against
// ONE 10s period with absolute keyframes (no per-element infinite loops with
// different durations, so phases can never drift apart). The plotter heads
// are lightweight SMIL <animateMotion> following the very same paths that are
// being drawn. No animation libraries.

const BLUE = "#2447ff";
const LIME = "#c8ff00";
const PAPER = "#f4f1e8";
const MONO =
  'ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Consolas, monospace';

// ---------------------------------------------------------------------------
// Master timeline — TOTAL = 10s, every animation shares this one period.
// (seconds, absolute within the loop)
// ---------------------------------------------------------------------------
const T = 10;

const TL: {
  marks: [number, number];
  s: { draw: [number, number]; erase: [number, number] };
  n1: { draw: [number, number]; erase: [number, number] };
  n2: { draw: [number, number]; erase: [number, number] };
  nodes: { erase: [number, number] };
  lime: { off: [number, number] };
  ann: [number, number];
} = {
  marks: [0.0, 0.6], // blueprint sheet initialises
  s: { draw: [0.55, 2.35], erase: [8.6, 9.2] }, // draw S, erase last
  n1: { draw: [1.75, 3.85], erase: [8.5, 9.1] }, // staggered start
  n2: { draw: [3.2, 5.2], erase: [8.4, 9.0] },
  nodes: { erase: [8.35, 8.95] },
  lime: { off: [8.2, 8.42] }, // lime nodes switch off first during erase
  ann: [7.0, 8.2], // completed-state annotations
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (t: number) => r2((t / T) * 100);

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

// S — one continuous plotter line (top-left → top curve → waist → lower bowl
// → bottom-right terminal tick).
const S_PATH =
  "M104 232 C140 192 204 200 205 242 C207 278 182 284 152 286 C122 286 104 298 112 340 C118 380 152 388 188 382 L208 370";

// N — three pen-down strokes: left vertical (bottom→top, with a small serif),
// diagonal (top-left → bottom-right), right vertical (bottom→top + serif).
const nPath = (cx: number) =>
  `M${cx - 49} 396 L${cx - 49} 196 L${cx - 54} 196 M${cx - 49} 196 L${cx + 49} 396 M${cx + 49} 396 L${cx + 49} 196 L${cx + 54} 196`;

const N1 = 320;
const N2 = 488;

type Conn = {
  id: string;
  cls: string;
  d: string;
  draw: [number, number];
  /** hidden on small screens to keep the mobile art focused on the letters */
  extra?: boolean;
};

// Neural connections — plotted one by one after the letters.
const CONNS: Conn[] = [
  { id: "lead", cls: "conn-lead", d: "M320 128 L320 196", draw: [4.6, 4.82] },
  {
    id: "a",
    cls: "conn-a",
    d: "M205 242 C240 238 254 236 271 234",
    draw: [4.82, 5.04],
    extra: true,
  },
  {
    id: "b",
    cls: "conn-b",
    d: "M208 370 C244 366 256 360 271 356",
    draw: [5.04, 5.26],
    extra: true,
  },
  { id: "c", cls: "conn-c", d: "M369 296 L439 296", draw: [5.26, 5.48] },
  { id: "br1", cls: "conn-br1", d: "M188 382 L188 430", draw: [5.48, 5.7] },
  {
    id: "br2",
    cls: "conn-br2",
    d: "M537 296 C562 300 572 308 582 320",
    draw: [5.7, 5.92],
  },
  {
    id: "br3",
    cls: "conn-br3",
    d: "M369 396 C380 410 388 418 400 430",
    draw: [5.92, 6.14],
  },
];

// Connections erase in reverse draw order, packed into 8.2–9.0.
const CONN_ERASE: Record<string, [number, number]> = {
  "conn-lead": [8.74, 8.99],
  "conn-a": [8.65, 8.9],
  "conn-b": [8.56, 8.81],
  "conn-c": [8.47, 8.72],
  "conn-br1": [8.38, 8.63],
  "conn-br2": [8.29, 8.54],
  "conn-br3": [8.2, 8.45],
};

// The plotter head for the connection layer follows one composite path
// (pen-up moveto jumps between the individual connections).
const CONN_CURSOR_PATH =
  "M320 128 L320 196 M205 242 C240 238 254 236 271 234 M208 370 C244 366 256 360 271 356 M369 296 L439 296 M188 382 L188 430 M537 296 C562 300 572 308 582 320 M369 396 C380 410 388 418 400 430";
// fractions where each sub-path starts (approx. from path lengths)
const CONN_CURSOR_KEYPOINTS =
  "0;0;0.163;0.327;0.486;0.654;0.769;0.889;1;1";
const CONN_CURSOR_KEYTIMES =
  "0;0.46;0.482;0.504;0.526;0.548;0.57;0.592;0.614;1";

// Nodes — each spawns (scale 0→1, opacity 0→1) right after the line has
// reached its position.
type NodeDef = { id: string; x: number; y: number; at: number; r?: number };
const NODES: NodeDef[] = [
  { id: "s0", x: 104, y: 232, at: 0.6 },
  { id: "s2", x: 152, y: 286, at: 1.5 },
  { id: "s3", x: 208, y: 370, at: 2.4 },
  { id: "n1-lb", x: 271, y: 396, at: 1.8 },
  { id: "n1-lt", x: 271, y: 196, at: 2.45 },
  { id: "n1-mid", x: 320, y: 296, at: 2.85 },
  { id: "n1-rb", x: 369, y: 396, at: 3.2 },
  { id: "n1-rt", x: 369, y: 196, at: 3.9 },
  { id: "n2-lb", x: 439, y: 396, at: 3.25 },
  { id: "n2-lt", x: 439, y: 196, at: 3.9 },
  { id: "n2-mid", x: 488, y: 296, at: 4.3 },
  { id: "n2-rb", x: 537, y: 396, at: 4.65 },
  { id: "n2-rt", x: 537, y: 196, at: 5.25 },
  { id: "src", x: 320, y: 128, at: 4.9, r: 5 },
  { id: "c23", x: 404, y: 296, at: 5.55 },
  { id: "br1", x: 188, y: 430, at: 5.75 },
  { id: "br2", x: 582, y: 320, at: 5.95 },
  { id: "br3", x: 400, y: 430, at: 6.1 },
];

// Lime "activation" — left → middle → right, once the whole network exists.
const LIME_AT = [
  { id: "s0", x: 104, y: 232, at: 6.1 },
  { id: "n1-mid", x: 320, y: 296, at: 6.32 },
  { id: "n2-rt", x: 537, y: 196, at: 6.54 },
];

// ---------------------------------------------------------------------------
// Keyframe generator — everything written in absolute % of the 10s master
// ---------------------------------------------------------------------------
const pathAnimCss = (cls: string, draw: [number, number], erase: [number, number]) => {
  const [ds, de] = [pct(draw[0]), pct(draw[1])];
  const [es, ee] = [pct(erase[0]), pct(erase[1])];
  return (
    `@keyframes ${cls}-kf{0%{stroke-dashoffset:100}${ds}%{stroke-dashoffset:100}${de}%{stroke-dashoffset:0}` +
    `${es}%{stroke-dashoffset:0}${ee}%{stroke-dashoffset:100}100%{stroke-dashoffset:100}}` +
    `.${cls}{stroke-dasharray:100;stroke-dashoffset:100;animation:${cls}-kf ${T}s linear infinite}`
  );
};

const nodeAnimCss = (cls: string, at: number) => {
  const a = pct(at);
  const a2 = pct(at + 0.28);
  const [es, ee] = [pct(TL.nodes.erase[0]), pct(TL.nodes.erase[1])];
  return (
    `@keyframes ${cls}-kf{0%{opacity:0;transform:scale(0)}${a}%{opacity:0;transform:scale(0)}${a2}%{opacity:1;transform:scale(1)}` +
    `${es}%{opacity:1;transform:scale(1)}${ee}%{opacity:0;transform:scale(.4)}100%{opacity:0;transform:scale(0)}}` +
    `.${cls}{opacity:0;transform:scale(0);transform-box:fill-box;transform-origin:center;animation:${cls}-kf ${T}s cubic-bezier(.22,.68,.32,1) infinite}`
  );
};

const cursorAnimCss = (cls: string, show: [number, number]) => {
  const s0 = Math.max(0, pct(show[0] - 0.35));
  const s = pct(show[0]);
  const e = pct(show[1]);
  const e2 = pct(show[1] + 0.35);
  return (
    `@keyframes ${cls}-kf{0%{opacity:0}${s0}%{opacity:0}${s}%{opacity:1}${e}%{opacity:1}${e2}%{opacity:0}100%{opacity:0}}` +
    `.${cls}{opacity:0;animation:${cls}-kf ${T}s linear infinite}`
  );
};

const limeAnimCss = (cls: string, at: number) => {
  const a = pct(at);
  const a2 = pct(at + 0.22);
  const [e1, e2] = [pct(TL.lime.off[0]), pct(TL.lime.off[1])];
  return (
    `@keyframes ${cls}-kf{0%{opacity:0;transform:scale(0)}${a}%{opacity:0;transform:scale(0)}${a2}%{opacity:1;transform:scale(1)}` +
    `${e1}%{opacity:1;transform:scale(1)}${e2}%{opacity:0;transform:scale(0)}100%{opacity:0;transform:scale(0)}}` +
    `.${cls}{opacity:0;transform:scale(0);transform-box:fill-box;transform-origin:center;animation:${cls}-kf ${T}s cubic-bezier(.22,.68,.32,1) infinite}`
  );
};

const ringAnimCss = (cls: string, at: number) => {
  const a = pct(at);
  const a2 = pct(at + 0.55);
  const a3 = pct(at + 0.95);
  return (
    `@keyframes ${cls}-kf{0%{opacity:0;transform:scale(.3)}${a}%{opacity:0;transform:scale(.3)}${a2}%{opacity:.55;transform:scale(1.7)}${a3}%{opacity:0;transform:scale(2.4)}100%{opacity:0;transform:scale(.3)}}` +
    `.${cls}{opacity:0;transform:scale(.3);transform-box:fill-box;transform-origin:center;animation:${cls}-kf ${T}s linear infinite}`
  );
};

const MARKS_CSS =
  `@keyframes marks-kf{0%{opacity:0}6%{opacity:1}100%{opacity:1}}` +
  `.plot-marks{opacity:0;animation:marks-kf ${T}s linear infinite}`;

const ANN_CSS =
  `@keyframes ann-kf{0%{opacity:0}70%{opacity:0}72.5%{opacity:1}82%{opacity:1}84.5%{opacity:0}100%{opacity:0}}` +
  `.plot-ann{opacity:0;animation:ann-kf ${T}s linear infinite}`;

function buildArtCss() {
  const parts: string[] = [MARKS_CSS];
  parts.push(pathAnimCss("plot-s", TL.s.draw, TL.s.erase));
  parts.push(pathAnimCss("plot-n1", TL.n1.draw, TL.n1.erase));
  parts.push(pathAnimCss("plot-n2", TL.n2.draw, TL.n2.erase));
  for (const c of CONNS) parts.push(pathAnimCss(c.cls, c.draw, CONN_ERASE[c.cls]));
  for (const n of NODES) parts.push(nodeAnimCss(`node-${n.id}`, n.at));
  parts.push(cursorAnimCss("plot-cursor-s", [0.55, 2.7] as [number, number]));
  parts.push(cursorAnimCss("plot-cursor-n1", [1.75, 4.2] as [number, number]));
  parts.push(cursorAnimCss("plot-cursor-n2", [3.2, 5.55] as [number, number]));
  parts.push(cursorAnimCss("plot-cursor-c", [4.6, 6.5] as [number, number]));
  for (const l of LIME_AT) {
    parts.push(limeAnimCss(`lime-${l.id}`, l.at));
    parts.push(ringAnimCss(`ring-${l.id}`, l.at));
  }
  parts.push(ANN_CSS);
  return parts.join("\n");
}

const ART_CSS = buildArtCss();

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export function SnnHeroArt({ className }: { className?: string }) {
  return (
    <>
      <style>{ART_CSS}</style>
      <svg
        className={className}
        viewBox="0 0 640 560"
        preserveAspectRatio="xMidYMid meet"
        aria-hidden="true"
        focusable="false"
      >
        {/* ============ construction layer (blueprint sheet) ============ */}
        <g className="plot-marks" data-plot-marks>
          {/* plot-area guide frame */}
          <path
            d="M84 116 L556 116 L556 424 L84 424 Z"
            fill="none"
            stroke={BLUE}
            strokeWidth={1}
            strokeDasharray="5 7"
            opacity={0.16}
          />
          {/* hairlines */}
          <line x1={320} y1={64} x2={320} y2={496} stroke={BLUE} strokeWidth={0.75} opacity={0.1} />
          <line x1={64} y1={296} x2={576} y2={296} stroke={BLUE} strokeWidth={0.75} opacity={0.1} />
          {/* registration crosshairs */}
          {[
            [52, 64],
            [588, 64],
            [52, 496],
            [588, 496],
          ].map(([x, y], i) => (
            <g key={`ch${i}`} stroke={BLUE} strokeWidth={1} opacity={0.35}>
              <line x1={x - 6} y1={y} x2={x + 6} y2={y} />
              <line x1={x} y1={y - 6} x2={x} y2={y + 6} />
            </g>
          ))}
          {/* top tick marks */}
          {[152, 320, 488].map((x) => (
            <line key={`tk${x}`} x1={x} y1={118} x2={x} y2={128} stroke={BLUE} strokeWidth={1} opacity={0.3} />
          ))}
          {/* bottom dimension line */}
          <line x1={100} y1={492} x2={540} y2={492} stroke={BLUE} strokeWidth={0.75} opacity={0.3} />
          <line x1={100} y1={486} x2={100} y2={498} stroke={BLUE} strokeWidth={0.75} opacity={0.3} />
          <line x1={540} y1={486} x2={540} y2={498} stroke={BLUE} strokeWidth={0.75} opacity={0.3} />
          <text
            x={320}
            y={484}
            textAnchor="middle"
            fill={BLUE}
            opacity={0.4}
            style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.1em" }}
          >
            SPAN 440
          </text>
          <text
            x={52}
            y={96}
            fill={BLUE}
            opacity={0.45}
            style={{ fontFamily: MONO, fontSize: 9, letterSpacing: "0.14em" }}
          >
            PLOT:SNN-01
          </text>
        </g>

        {/* ============ primary: the letters ============ */}
        {[
          { id: "art-s", cls: "plot-s", d: S_PATH },
          { id: "art-n1", cls: "plot-n1", d: nPath(N1) },
          { id: "art-n2", cls: "plot-n2", d: nPath(N2) },
        ].map((p) => (
          <g key={p.id}>
            {/* soft halo so the drawn stroke reads well on paper */}
            <path
              d={p.d}
              fill="none"
              stroke={BLUE}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.1}
              pathLength={100}
              className={p.cls}
            />
            <path
              id={p.id}
              d={p.d}
              fill="none"
              stroke={BLUE}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={100}
              className={p.cls}
              data-plot-path
            />
          </g>
        ))}

        {/* ============ secondary: neural connections ============ */}
        {CONNS.map((c) => (
          <path
            key={c.id}
            className={`${c.cls} plot-conn${c.extra ? " plot-conn-extra" : ""}`}
            d={c.d}
            fill="none"
            stroke={BLUE}
            strokeWidth={1.3}
            strokeLinecap="round"
            opacity={0.9}
            pathLength={100}
            data-plot-conn
          />
        ))}

        {/* ============ nodes (spawn when the line arrives) ============ */}
        {NODES.map((n) => (
          <g key={n.id} className={`node-${n.id} plot-node`} data-plot-node>
            <circle cx={n.x} cy={n.y} r={n.r ?? 4.2} fill={PAPER} stroke={BLUE} strokeWidth={1.4} />
          </g>
        ))}

        {/* ============ lime activation overlays + rings ============ */}
        {LIME_AT.map((l) => (
          <g key={l.id}>
            <circle
              className={`lime-${l.id} plot-lime`}
              data-plot-lime
              cx={l.x}
              cy={l.y}
              r={4.2}
              fill={LIME}
            />
            <circle
              className={`ring-${l.id} plot-ring`}
              data-plot-ring
              cx={l.x}
              cy={l.y}
              r={7}
              fill="none"
              stroke={LIME}
              strokeWidth={1.2}
            />
          </g>
        ))}

        {/* ============ plotter heads (follow the path being drawn) ============ */}
        <g className="plot-cursor plot-cursor-s" data-plot-cursor>
          <circle r={3} fill={BLUE} />
          <circle r={6} fill="none" stroke={BLUE} strokeWidth={1.1} opacity={0.4} />
          <animateMotion
            dur={`${T}s`}
            begin="0.55s"
            repeatCount="indefinite"
            calcMode="linear"
            keyPoints="0;1;1"
            keyTimes="0;0.18;1"
          >
            <mpath href="#art-s" xlinkHref="#art-s" />
          </animateMotion>
        </g>
        <g className="plot-cursor plot-cursor-n1" data-plot-cursor>
          <circle r={3} fill={BLUE} />
          <circle r={6} fill="none" stroke={BLUE} strokeWidth={1.1} opacity={0.4} />
          <animateMotion
            dur={`${T}s`}
            begin="1.75s"
            repeatCount="indefinite"
            calcMode="linear"
            keyPoints="0;1;1"
            keyTimes="0;0.21;1"
          >
            <mpath href="#art-n1" xlinkHref="#art-n1" />
          </animateMotion>
        </g>
        <g className="plot-cursor plot-cursor-n2" data-plot-cursor>
          <circle r={3} fill={BLUE} />
          <circle r={6} fill="none" stroke={BLUE} strokeWidth={1.1} opacity={0.4} />
          <animateMotion
            dur={`${T}s`}
            begin="3.2s"
            repeatCount="indefinite"
            calcMode="linear"
            keyPoints="0;1;1"
            keyTimes="0;0.2;1"
          >
            <mpath href="#art-n2" xlinkHref="#art-n2" />
          </animateMotion>
        </g>
        <g className="plot-cursor plot-cursor-c" data-plot-cursor>
          <circle r={3} fill={BLUE} />
          <circle r={6} fill="none" stroke={BLUE} strokeWidth={1.1} opacity={0.4} />
          <animateMotion
            dur={`${T}s`}
            begin="0s"
            repeatCount="indefinite"
            calcMode="linear"
            keyPoints={CONN_CURSOR_KEYPOINTS}
            keyTimes={CONN_CURSOR_KEYTIMES}
          >
            <mpath href="#art-conn-path" xlinkHref="#art-conn-path" />
          </animateMotion>
        </g>
        {/* composite path used by the connection plotter head */}
        <path id="art-conn-path" d={CONN_CURSOR_PATH} fill="none" stroke="none" />

        {/* ============ completed-state annotations ============ */}
        <g className="plot-ann" data-plot-fade>
          <text
            x={320}
            y={470}
            textAnchor="middle"
            fill={BLUE}
            opacity={0.7}
            style={{ fontFamily: MONO, fontSize: 10, letterSpacing: "0.22em", fontWeight: 600 }}
          >
            {"SNN // NEURAL SYSTEM"}
          </text>
          <circle cx={556} cy={148} r={3} fill={LIME} />
          <text
            x={585}
            y={152}
            textAnchor="end"
            fill={BLUE}
            opacity={0.7}
            style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: "0.14em", fontWeight: 600 }}
          >
            {"NETWORK: ACTIVE"}
          </text>
        </g>
      </svg>
    </>
  );
}
