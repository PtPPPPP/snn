// SnnHeroArt — "DIGITAL PLOTTER / NEURAL BLUEPRINT"
//
// The old radial-network / concentric-orbit HUD is gone. This is a single
// master-timeline story: a blueprint sheet initialises, then an invisible
// plotter head draws S, N, N — one letter segment at a time, in normal reading
// direction — then neural connections are plotted AFTER all three letters are
// complete, nodes spawn only where the line has already arrived, three nodes
// activate lime left → mid → right, the completed network holds, then
// everything retracts (erase) and the loop restarts seamlessly.
//
// Readability first: the S is a conventional uppercase-S skeleton split into
// three independent paths (S_TOP arc / S_MIDDLE waist / S_BOTTOM bowl) so its
// orientation can never flip from a single bad control point. Every letter was
// calibrated during development against a standard bold sans-serif reference
// (see DEV_GUIDE below; removed in production).
//
// Technique: React + inline SVG + pure CSS. Every element animates against
// ONE 10s period with absolute keyframes (no per-element infinite loops with
// different durations, so phases can never drift apart). The plotter heads
// are lightweight SMIL <animateMotion> following the very same paths that are
// being drawn. No animation libraries.

const BLUE = "#2447ff";
const LIME = "#c8ff00";
const PAPER = "#f4f1e8";
const INK = "#11110f";
const MONO =
  'ui-monospace, "SF Mono", "Cascadia Mono", "JetBrains Mono", Consolas, monospace';

// DEV-GUIDE reference layer (standard bold sans-serif letters, same bounding
// boxes, dark translucent). Used ONLY for development calibration; must be
// false in production builds.
const DEV_GUIDE = false;

// ---------------------------------------------------------------------------
// Master timeline — TOTAL = 10s, every animation shares this one period.
// (seconds, absolute within the loop)
// ---------------------------------------------------------------------------
const T = 10;

const TL: {
  marks: [number, number];
  nodes: { erase: [number, number] };
  lime: { off: [number, number] };
  ann: [number, number];
} = {
  marks: [0.0, 0.6], // blueprint sheet initialises
  nodes: { erase: [8.3, 8.7] },
  lime: { off: [8.3, 8.5] }, // lime nodes switch off first during erase
  ann: [7.6, 8.4], // completed-state annotations
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const pct = (t: number) => r2((t / T) * 100);

// ---------------------------------------------------------------------------
// Letter geometry — readability first, engineering styling second.
// ---------------------------------------------------------------------------

// S — conventional uppercase S, split into three continuous segments:
//   S_TOP    : top-left start → round top arc → top-right vertex
//   S_MIDDLE : top-right vertex → right side down → waist crossing left
//   S_BOTTOM : waist → lower-left side → round bottom bowl → bottom-right
//              terminal tick
// This is the normal-reading "S" (upper body right, waist crossing left,
// lower body left, bottom sweeping right).
const S_TOP = "M98 252 C102 206 130 194 160 197 C190 200 212 218 214 250";
const S_MIDDLE = "M214 250 C216 282 206 300 182 310 C160 318 136 314 120 308";
const S_BOTTOM =
  "M120 308 C104 314 96 330 98 352 C100 376 124 392 154 392 C186 392 208 378 216 356 L222 344";

// N — left vertical (bottom→top + serif), diagonal (top-left → bottom-right),
// right vertical (bottom→top + serif). Width matched to S's visual weight.
const nPath = (cx: number) =>
  `M${cx - 57} 396 L${cx - 57} 196 L${cx - 62} 196 M${cx - 57} 196 L${cx + 57} 396 M${cx + 57} 396 L${cx + 57} 196 L${cx + 62} 196`;

const N1 = 320;
const N2 = 488;

// ---------------------------------------------------------------------------
// Segments: each letter segment is its own path with its own draw/erase
// window on the master timeline (draw windows overlap slightly so the pen
// never appears to stop).
// ---------------------------------------------------------------------------
type Seg = {
  id: string;
  cls: string;
  d: string;
  draw: [number, number];
  erase: [number, number];
};

const S_SEGS: Seg[] = [
  { id: "art-s-top", cls: "plot-s-top", d: S_TOP, draw: [0.55, 1.15], erase: [8.85, 9.2] },
  { id: "art-s-mid", cls: "plot-s-mid", d: S_MIDDLE, draw: [1.05, 1.75], erase: [8.75, 9.1] },
  { id: "art-s-bot", cls: "plot-s-bot", d: S_BOTTOM, draw: [1.65, 2.45], erase: [8.65, 9.0] },
];

const N1_SEGS: Seg[] = [
  { id: "art-n1", cls: "plot-n1", d: nPath(N1), draw: [2.5, 4.3], erase: [8.55, 8.9] },
];

const N2_SEGS: Seg[] = [
  { id: "art-n2", cls: "plot-n2", d: nPath(N2), draw: [3.9, 5.7], erase: [8.45, 8.8] },
];

const ALL_SEGS: Seg[] = [...S_SEGS, ...N1_SEGS, ...N2_SEGS];

// Composite path used by the S plotter head (TOP → MIDDLE → BOTTOM,
// continuous, so the head never jumps).
const S_COMBO = `${S_TOP}${S_MIDDLE}${S_BOTTOM}`;

type Conn = {
  id: string;
  cls: string;
  d: string;
  draw: [number, number];
  erase: [number, number];
  /** hidden on small screens to keep the mobile art focused on the letters */
  extra?: boolean;
};

// Neural connections — plotted ONLY after S, N1 and N2 are all complete
// (letters finish at 5.7s, connections start at 5.8s).
const CONNS: Conn[] = [
  // Draw upward so the plotter arrives at the source node when it appears.
  { id: "lead", cls: "conn-lead", d: "M320 196 L320 128", draw: [5.8, 5.97], erase: [8.62, 8.71] },
  {
    id: "a",
    cls: "conn-a",
    d: "M214 250 C230 254 246 252 263 250",
    draw: [5.97, 6.14],
    erase: [8.55, 8.64],
    extra: true,
  },
  {
    id: "b",
    cls: "conn-b",
    d: "M216 356 C230 358 246 358 263 356",
    draw: [6.14, 6.31],
    erase: [8.48, 8.57],
    extra: true,
  },
  { id: "c", cls: "conn-c", d: "M377 296 L431 296", draw: [6.31, 6.48], erase: [8.41, 8.5] },
  { id: "br1", cls: "conn-br1", d: "M154 392 L154 430", draw: [6.48, 6.65], erase: [8.34, 8.43] },
  {
    id: "br2",
    cls: "conn-br2",
    d: "M545 296 C570 300 580 308 590 320",
    draw: [6.65, 6.82],
    erase: [8.27, 8.36],
  },
  {
    id: "br3",
    cls: "conn-br3",
    d: "M377 396 C388 410 396 418 408 430",
    draw: [6.82, 6.99],
    erase: [8.2, 8.29],
  },
];

// The plotter head for the connection layer follows one composite path
// (pen-up moveto jumps between the individual connections).
const CONN_CURSOR_PATH = CONNS.map((c) => c.d).join(" ");
// fractions where each sub-path starts (approx. from path lengths; verified at
// build time via getTotalLength)
const CONN_CURSOR_KEYPOINTS =
  "0;0;0.185;0.334;0.483;0.63;0.733;0.874;1;1";
const CONN_CURSOR_KEYTIMES =
  "0;0.58;0.597;0.614;0.631;0.648;0.665;0.682;0.699;1";

// Nodes — each spawns (scale 0→1, opacity 0→1) right after the line has
// reached its position. Small (r≈3.2) so they never overpower the letter
// outlines; the S keeps only end-point nodes (start + terminal).
type NodeDef = { id: string; x: number; y: number; at: number; r?: number };
const NODES: NodeDef[] = [
  { id: "s0", x: 98, y: 252, at: 0.65 },
  { id: "s3", x: 222, y: 344, at: 2.55 },
  { id: "n1-lb", x: 263, y: 396, at: 2.6 },
  { id: "n1-lt", x: 263, y: 196, at: 3.2 },
  { id: "n1-mid", x: 320, y: 296, at: 3.45 },
  { id: "n1-rb", x: 377, y: 396, at: 3.75 },
  { id: "n1-rt", x: 377, y: 196, at: 4.4 },
  { id: "n2-lb", x: 431, y: 396, at: 4.0 },
  { id: "n2-lt", x: 431, y: 196, at: 4.6 },
  { id: "n2-mid", x: 488, y: 296, at: 4.85 },
  { id: "n2-rb", x: 545, y: 396, at: 5.15 },
  { id: "n2-rt", x: 545, y: 196, at: 5.8 },
  { id: "src", x: 320, y: 128, at: 6.05, r: 4 },
  { id: "c23", x: 404, y: 296, at: 6.55 },
  { id: "br1", x: 154, y: 430, at: 6.7 },
  { id: "br2", x: 590, y: 320, at: 6.88 },
  { id: "br3", x: 408, y: 430, at: 7.05 },
];

// Lime "activation" — left → middle → right, after the whole network exists.
const LIME_AT = [
  { id: "s0", x: 98, y: 252, at: 7.0 },
  { id: "n1-mid", x: 320, y: 296, at: 7.2 },
  { id: "n2-rt", x: 545, y: 196, at: 7.4 },
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
  // fade in starts exactly at show[0] (= SMIL begin) so the head never sits
  // at the SVG origin while visible; holds until show[1], then fades out.
  const s0 = pct(show[0]);
  const s = pct(show[0] + 0.35);
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
  `@keyframes ann-kf{0%{opacity:0}76%{opacity:0}78.5%{opacity:1}84%{opacity:1}85.5%{opacity:0}100%{opacity:0}}` +
  `.plot-ann{opacity:0;animation:ann-kf ${T}s linear infinite}`;

function buildArtCss() {
  const parts: string[] = [MARKS_CSS];
  for (const seg of ALL_SEGS) parts.push(pathAnimCss(seg.cls, seg.draw, seg.erase));
  for (const c of CONNS) parts.push(pathAnimCss(c.cls, c.draw, c.erase));
  for (const n of NODES) parts.push(nodeAnimCss(`node-${n.id}`, n.at));
  parts.push(cursorAnimCss("plot-cursor-s", [0.55, 2.6] as [number, number]));
  parts.push(cursorAnimCss("plot-cursor-n1", [2.5, 4.5] as [number, number]));
  parts.push(cursorAnimCss("plot-cursor-n2", [3.9, 5.95] as [number, number]));
  parts.push(cursorAnimCss("plot-cursor-c", [5.7, 7.15] as [number, number]));
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
        {/* ============ DEV calibration reference layer (removed in prod) ============ */}
        {DEV_GUIDE && (
          <g data-dev-guide fill={INK} opacity={0.28}>
            {/* standard bold sans-serif S, scaled into the art-S box
                (x≈90-220, y 195-390) */}
            <text
              x={52}
              y={150}
              dominantBaseline="hanging"
              fontFamily="Arial, Helvetica, sans-serif"
              fontWeight={800}
              fontSize={272}
            >
              S
            </text>
            {/* standard N references (direction/width check only) */}
            <text
              x={276}
              y={196}
              dominantBaseline="hanging"
              fontFamily="Arial, Helvetica, sans-serif"
              fontWeight={800}
              fontSize={210}
            >
              N
            </text>
            <text
              x={444}
              y={196}
              dominantBaseline="hanging"
              fontFamily="Arial, Helvetica, sans-serif"
              fontWeight={800}
              fontSize={210}
            >
              N
            </text>
          </g>
        )}

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

        {/* ============ primary: the letters (each segment halo + main) ============ */}
        {ALL_SEGS.map((seg) => (
          <g key={seg.id}>
            {/* soft halo so the drawn stroke reads well on paper */}
            <path
              d={seg.d}
              fill="none"
              stroke={BLUE}
              strokeWidth={5}
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.1}
              pathLength={100}
              className={seg.cls}
            />
            <path
              id={seg.id}
              d={seg.d}
              fill="none"
              stroke={BLUE}
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
              pathLength={100}
              className={seg.cls}
              data-plot-path
            />
          </g>
        ))}

        {/* ============ secondary: neural connections (after letters) ============ */}
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

        {/* ============ nodes (spawn when the line arrives; small) ============ */}
        {NODES.map((n) => (
          <g key={n.id} className={`node-${n.id} plot-node`} data-plot-node>
            <circle cx={n.x} cy={n.y} r={n.r ?? 3.2} fill={PAPER} stroke={BLUE} strokeWidth={1.2} />
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
              r={3.2}
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
            keyPoints="0;0.284;0.284;0.545;0.545;1"
            keyTimes="0;0.055;0.115;0.175;0.245;1"
          >
            <mpath href="#art-s-combo" xlinkHref="#art-s-combo" />
          </animateMotion>
        </g>
        <g className="plot-cursor plot-cursor-n1" data-plot-cursor>
          <circle r={3} fill={BLUE} />
          <circle r={6} fill="none" stroke={BLUE} strokeWidth={1.1} opacity={0.4} />
          <animateMotion
            dur={`${T}s`}
            begin="2.5s"
            repeatCount="indefinite"
            calcMode="linear"
            keyPoints="0;1;1;1"
            keyTimes="0;0.25;0.43;1"
          >
            <mpath href="#art-n1" xlinkHref="#art-n1" />
          </animateMotion>
        </g>
        <g className="plot-cursor plot-cursor-n2" data-plot-cursor>
          <circle r={3} fill={BLUE} />
          <circle r={6} fill="none" stroke={BLUE} strokeWidth={1.1} opacity={0.4} />
          <animateMotion
            dur={`${T}s`}
            begin="3.9s"
            repeatCount="indefinite"
            calcMode="linear"
            keyPoints="0;1;1;1"
            keyTimes="0;0.39;0.57;1"
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
        {/* hidden reference paths used by the plotter heads */}
        <path id="art-s-combo" d={S_COMBO} fill="none" stroke="none" />
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
