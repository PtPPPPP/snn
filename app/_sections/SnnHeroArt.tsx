// SnnHeroArt — a code-drawn (procedural SVG) hero visual for SNN.
// Replaces the static robot-arm photo with a generative neural-network
// topology that matches the brand: paper background, blue connection lines,
// lime accent nodes, ink core. Pure SVG, no image assets, scales via viewBox.

const BLUE = "#2447ff";
const LIME = "#c8ff00";
const INK = "#11110f";
const PAPER = "#f4f1e8";

// 8 branches offset by 22.5deg so none sit exactly on the axes — keeps the
// top/bottom centre clear for the blueprint labels.
const BRANCHES = [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];
const R_CORE = 70;
const R_MID = 130;
const R_OUTER = 210;
// A few branches carry a lime "active" leaf node as an accent.
const LIME_AT = new Set([67.5, 202.5, 292.5]);

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return {
    x: +(cx + r * Math.cos(a)).toFixed(2),
    y: +(cy + r * Math.sin(a)).toFixed(2),
  };
}

export function SnnHeroArt({ className }: { className?: string }) {
  const cx = 320;
  const cy = 280;

  const nodes = BRANCHES.map((deg) => ({
    deg,
    start: polar(cx, cy, R_CORE, deg),
    mid: polar(cx, cy, R_MID, deg),
    outer: polar(cx, cy, R_OUTER, deg),
    leaf: polar(cx, cy, R_OUTER - 28, deg + 24),
    lime: LIME_AT.has(deg),
  }));

  const hexPoints = Array.from({ length: 6 }, (_, i) =>
    polar(cx, cy, 92, i * 60 + 30),
  )
    .map((p) => `${p.x},${p.y}`)
    .join(" ");

  return (
    <svg
      className={className}
      viewBox="0 0 640 560"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
      focusable="false"
    >
      {/* outer scanning orbit */}
      <circle
        className="art-orbit"
        cx={cx}
        cy={cy}
        r={244}
        stroke={BLUE}
        strokeWidth={1}
        strokeDasharray="3 11"
        opacity={0.22}
      />
      {/* secondary orbit */}
      <circle
        cx={cx}
        cy={cy}
        r={180}
        stroke={BLUE}
        strokeWidth={1}
        strokeDasharray="2 10"
        opacity={0.14}
      />

      {/* outer octagonal mesh (connections between branch tips) */}
      {nodes.map((n, i) => {
        const next = nodes[(i + 1) % nodes.length];
        return (
          <line
            key={`mo${i}`}
            x1={n.outer.x}
            y1={n.outer.y}
            x2={next.outer.x}
            y2={next.outer.y}
            stroke={BLUE}
            strokeWidth={1}
            opacity={0.16}
          />
        );
      })}
      {/* inner octagonal mesh (connections between mid nodes) */}
      {nodes.map((n, i) => {
        const next = nodes[(i + 1) % nodes.length];
        return (
          <line
            key={`mi${i}`}
            x1={n.mid.x}
            y1={n.mid.y}
            x2={next.mid.x}
            y2={next.mid.y}
            stroke={BLUE}
            strokeWidth={1}
            opacity={0.12}
          />
        );
      })}

      {/* radial branches: spine + offshoot + nodes */}
      {nodes.map((n) => (
        <g key={n.deg}>
          <line
            x1={n.start.x}
            y1={n.start.y}
            x2={n.outer.x}
            y2={n.outer.y}
            stroke={BLUE}
            strokeWidth={1.2}
            opacity={0.5}
          />
          <line
            x1={n.mid.x}
            y1={n.mid.y}
            x2={n.leaf.x}
            y2={n.leaf.y}
            stroke={BLUE}
            strokeWidth={1}
            opacity={0.32}
          />
          <circle cx={n.mid.x} cy={n.mid.y} r={4.5} fill={PAPER} stroke={BLUE} strokeWidth={1.4} />
          <circle
            cx={n.outer.x}
            cy={n.outer.y}
            r={n.lime ? 6.5 : 5}
            fill={n.lime ? LIME : PAPER}
            stroke={BLUE}
            strokeWidth={1.4}
            className={n.lime ? "art-pulse" : undefined}
            style={n.lime ? { animationDelay: `${(n.deg / 360) * 3}s` } : undefined}
          />
          <circle cx={n.leaf.x} cy={n.leaf.y} r={3} fill={BLUE} opacity={0.5} />
        </g>
      ))}

      {/* hexagonal tech frame around the core */}
      <polygon points={hexPoints} stroke={BLUE} strokeWidth={1} opacity={0.3} />

      {/* concentric core rings */}
      <circle cx={cx} cy={cy} r={70} stroke={BLUE} strokeWidth={1} opacity={0.3} />
      <circle cx={cx} cy={cy} r={46} stroke={BLUE} strokeWidth={1} opacity={0.45} />
      <circle cx={cx} cy={cy} r={26} stroke={BLUE} strokeWidth={1.2} opacity={0.6} />

      {/* central core node */}
      <g className="art-breathe">
        <circle cx={cx} cy={cy} r={11} fill={LIME} />
        <circle cx={cx} cy={cy} r={5} fill={INK} />
      </g>

      {/* blueprint-style technical labels */}
      <text
        x={cx}
        y={138}
        textAnchor="middle"
        fill={BLUE}
        opacity={0.55}
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: "0.16em",
        }}
      >
        {"// NEURAL CORE"}
      </text>
      <text
        x={cx}
        y={436}
        textAnchor="middle"
        fill={BLUE}
        opacity={0.5}
        style={{
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
          fontWeight: 800,
          letterSpacing: "0.3em",
        }}
      >
        S · N · N
      </text>
    </svg>
  );
}
