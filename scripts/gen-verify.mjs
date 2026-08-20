// gen-verify.mjs — build a DOM-state verification page for the SNN plotter art.
//
// Extracts the art <style> + <svg class="hero-art"> from the built
// ftp-upload/index.html, embeds them in a bare page, and runs a script that
// seeks every CSS animation (negative animation-delay + paused) and the SMIL
// timeline (pauseAnimations + setCurrentTime) to a list of instants, then
// reports exact animated values. Serves as ground truth that the 10s master
// timeline, path drawing, node spawns, lime activation, erase and loop phase
// (t vs t+10s) all behave as designed — in a real browser.
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const html = await readFile(path.join(root, "ftp-upload", "index.html"), "utf8");

const styleMatch = html.match(/<style>[\s\S]*?<\/style>/);
const svgMatch = html.match(/<svg[^>]*class="hero-art"[\s\S]*?<\/svg>/);
if (!styleMatch || !svgMatch) {
  throw new Error("Could not locate art <style> / hero-art <svg> in built index.html");
}

const TIMES = [
  0.1, 0.3, 0.7, 1.0, 1.4, 1.8, 2.0, 2.4, 2.55, 2.8, 3.0, 3.4, 3.5, 3.8, 4.0, 4.4, 4.6,
  4.8, 5.0, 5.4, 5.6, 5.8, 5.9, 6.0, 6.2, 6.4, 6.8, 7.2, 7.6, 7.8, 8.0, 8.6, 8.8, 9.0, 9.6,
  12.0, // loop-phase pair with 2.0
  15.0, // loop-phase pair with 5.0
];

const PATHS = ["#art-s-path", "#art-n1", "#art-n2", ".conn-lead", ".conn-a", ".conn-b", ".conn-c", ".conn-br1", ".conn-br2", ".conn-br3"];
const NODES = [".node-s-start", ".node-s-waist", ".node-s-end", ".node-n1-lb", ".node-n1-lt", ".node-n1-mid", ".node-n1-rt", ".node-n2-lb", ".node-n2-lt", ".node-n2-mid", ".node-n2-rt", ".node-src", ".node-c23", ".node-br3"];
const LIMES = [".lime-s-start", ".lime-n1-mid", ".lime-n2-rt"];
const CURSORS = [".plot-cursor-s", ".plot-cursor-n1", ".plot-cursor-n2", ".plot-cursor-c"];
const GROUPS = [".plot-marks", ".plot-ann"];

const script = `
<script>
(function () {
  var TIMES = ${JSON.stringify(TIMES)};
  var PATHS = ${JSON.stringify(PATHS)};
  var NODES = ${JSON.stringify(NODES)};
  var LIMES = ${JSON.stringify(LIMES)};
  var CURSORS = ${JSON.stringify(CURSORS)};
  var GROUPS = ${JSON.stringify(GROUPS)};

  function seekCss(sel, t) {
    document.querySelectorAll(sel).forEach(function (el) {
      el.style.animationDelay = (-t) + "s";
      el.style.animationPlayState = "paused";
    });
  }
  function cssVal(el, prop) {
    return getComputedStyle(el)[prop];
  }
  function cursorViewBox(g, svg) {
    // robust screen→viewBox mapping via bounding rects
    var b = g.getBoundingClientRect();
    var s = svg.getBoundingClientRect();
    var sx = s.width / 640;
    var sy = s.height / 560;
    return {
      x: Math.round(((b.left + b.width / 2) - s.left) / sx * 10) / 10,
      y: Math.round(((b.top + b.height / 2) - s.top) / sy * 10) / 10,
    };
  }
  // Read the SMIL values from the rendered SVG. This keeps the verifier in
  // lockstep with SnnHeroArt.tsx instead of maintaining a second parameter set.
  function cursorSpec(sel) {
    var motion = document.querySelector(sel + " animateMotion");
    var mpath = motion.querySelector("mpath");
    return {
      path: mpath.getAttribute("href") || mpath.getAttribute("xlink:href"),
      begin: parseFloat(motion.getAttribute("begin")) || 0,
      keyTimes: motion.getAttribute("keyTimes").split(";").map(Number),
      keyPoints: motion.getAttribute("keyPoints").split(";").map(Number),
    };
  }
  function expectedCursorPos(sel, t) {
    var spec = cursorSpec(sel);
    var path = document.querySelector(spec.path);
    var internal = t - spec.begin;
    if (internal < 0) return { x: 0, y: 0 }; // motion has not started
    internal = internal % 10;
    var kf = internal / 10;
    var frac = 0;
    for (var i = 0; i < spec.keyTimes.length - 1; i++) {
      var k0 = spec.keyTimes[i], k1 = spec.keyTimes[i + 1];
      if (kf >= k0 && kf <= k1) {
        var span = k1 - k0 || 1;
        frac = spec.keyPoints[i] + (kf - k0) / span * (spec.keyPoints[i + 1] - spec.keyPoints[i]);
        break;
      }
    }
    var pt = path.getPointAtLength(frac * path.getTotalLength());
    return { x: Math.round(pt.x * 10) / 10, y: Math.round(pt.y * 10) / 10 };
  }
  async function run() {
    try {
      var svg = document.querySelector("svg.hero-art");
      if (!svg) { report(JSON.stringify({ error: "no svg" })); return; }
      var reportData = [];
      for (var i = 0; i < TIMES.length; i++) {
        var t = TIMES[i];
        // seek CSS animations
        PATHS.forEach(function (s) { seekCss(s, t); });
        NODES.forEach(function (s) { seekCss(s, t); });
        LIMES.forEach(function (s) { seekCss(s, t); });
        GROUPS.forEach(function (s) { seekCss(s, t); });
        CURSORS.forEach(function (s) { seekCss(s, t); });
        // seek SMIL timeline and give it a sample
        svg.pauseAnimations();
        svg.setCurrentTime(t);
        await new Promise(function (r) { setTimeout(r, 60); });

      var row = { t: t };
      row.paths = {};
      PATHS.forEach(function (s) {
        row.paths[s] = cssVal(document.querySelector(s), "strokeDashoffset");
      });
      row.nodes = {};
      NODES.forEach(function (s) {
        var el = document.querySelector(s);
        row.nodes[s] = {
          op: cssVal(el, "opacity"),
          tr: cssVal(el, "transform"),
        };
      });
      row.limes = {};
      LIMES.forEach(function (s) {
        row.limes[s] = { op: cssVal(document.querySelector(s), "opacity") };
      });
      row.groups = {};
      GROUPS.forEach(function (s) {
        var el = document.querySelector(s);
        row.groups[s] = {
          op: cssVal(el, "opacity"),
          anims: el.getAnimations().map(function (x) {
            return { name: x.animationName, cur: x.currentTime, state: x.playState };
          }),
        };
      });
      row.cursors = {};
      CURSORS.forEach(function (s) {
        var g = document.querySelector(s);
        if (!g) { row.cursors[s] = null; return; }
        var p = cursorViewBox(g, svg);
        var exp = expectedCursorPos(s, t);
        row.cursors[s] = {
          x: p.x,
          y: p.y,
          op: cssVal(g, "opacity"),
          exp: exp,
        };
      });
      reportData.push(row);
      }
    report(JSON.stringify(reportData));
    } catch (e) {
      report(JSON.stringify({ error: String(e && e.stack || e) }));
    }
  }
  function report(json) {
    var pre = document.getElementById("report");
    if (pre) pre.textContent = json;
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
</script>
`;

const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SNN plotter art — state verification harness</title>
<link rel="stylesheet" href="/styles.css">
</head>
<body style="margin:0">
${styleMatch[0]}
${svgMatch[0]}
<pre id="report" style="position:absolute;left:0;top:0;font:11px monospace;color:#000;background:#fff;padding:8px;white-space:pre-wrap;max-height:50vh;overflow:auto;z-index:99"></pre>
${script}
</body>
</html>
`;

await mkdir(path.join(root, ".preview"), { recursive: true });
const outPath = path.join(root, ".preview", "verify.html");
await writeFile(outPath, page, "utf8");
console.log(`verify harness written: ${outPath}`);

// clean.html — same art, no report overlay / no script: for screenshot pixel
// analysis of the naturally-running animation (real CSS+SMIL clocks under
// virtual time).
const ENTER_OFF = `<style>.hero-art{animation:none !important}</style>`;

const cleanPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SNN plotter art — clean render</title>
<link rel="stylesheet" href="/styles.css">
<style>.hero-art{width:100% !important;height:auto !important;max-width:640px}</style>
${ENTER_OFF}
</head>
<body style="margin:0;background:#f4f1e8;width:100%;max-width:640px">
${styleMatch[0]}
${svgMatch[0]}
</body>
</html>
`;
const cleanPath = path.join(root, ".preview", "clean.html");
await writeFile(cleanPath, cleanPage, "utf8");
console.log(`clean render written: ${cleanPath}`);

// seek.html — deterministic pixel-exact frames: the script seeks CSS
// animations (negative delay + pause) and the SMIL timeline to ?t=<seconds>,
// so a headless screenshot at that URL shows the exact animation state.
const seekScript = `
<script>
(function () {
  var t = parseFloat(new URLSearchParams(location.search).get("t") || "0");
  function seek(sel) {
    document.querySelectorAll(sel).forEach(function (el) {
      el.style.animationDelay = (-t) + "s";
      el.style.animationPlayState = "paused";
    });
  }
  var sel = [
    "#art-s-path","#art-n1","#art-n2",
    ".conn-lead",".conn-a",".conn-b",".conn-c",".conn-br1",".conn-br2",".conn-br3",
    ".plot-node",".plot-lime",".plot-ring",".plot-marks",".plot-ann",
    ".plot-cursor-s",".plot-cursor-n1",".plot-cursor-n2",".plot-cursor-c"
  ];
  sel.forEach(seek);
  var svg = document.querySelector("svg.hero-art");
  svg.pauseAnimations();
  svg.setCurrentTime(t);
  var r = svg.getBoundingClientRect();
  var cs = getComputedStyle(svg);
  var b = document.body.getBoundingClientRect();
  var vals = {};
  ["#art-s-top", "#art-s-mid", "#art-s-bot", "#art-n1", "#art-n2", ".conn-lead", ".conn-c"].forEach(function (s2) {
    var el = document.querySelector(s2);
    if (el) vals[s2] = getComputedStyle(el).strokeDashoffset;
  });
  document.title = JSON.stringify({ vw: innerWidth, vh: innerHeight, bodyW: b.width, bodyH: b.height, svg: { x: r.x, y: r.y, w: r.width, h: r.height }, css: { w: cs.width, h: cs.height, mw: cs.maxWidth, mh: cs.maxHeight, display: cs.display }, sheets: document.styleSheets.length, htmlW: document.documentElement.scrollWidth, dash: vals });
  setTimeout(function () {}, 80);
})();
</script>
`;
const seekPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SNN plotter art — seek</title>
<link rel="stylesheet" href="/styles.css">
<style>.hero-art{width:100% !important;height:auto !important;max-width:640px}</style>
${ENTER_OFF}
</head>
<body style="margin:0;background:#f4f1e8;width:100%;max-width:640px">
${styleMatch[0]}
${svgMatch[0]}
${seekScript}
</body>
</html>
`;
const seekPath = path.join(root, ".preview", "seek.html");
await writeFile(seekPath, seekPage, "utf8");
console.log(`seek render written: ${seekPath}`);

// lines.html — ONLY the blue letter strokes (marks/nodes/conns/cursors/ann
// hidden): the strictest readability check — "nothing but the main lines".
const linesOnlyPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SNN plotter art — lines only</title>
<link rel="stylesheet" href="/styles.css">
<style>.hero-art{width:100% !important;height:auto !important;max-width:640px}</style>
${ENTER_OFF}
<style>
.plot-marks, .plot-ann, .plot-node, .plot-lime, .plot-ring, .plot-cursor, .plot-conn { display: none; }
</style>
</head>
<body style="margin:0;background:#f4f1e8;width:100%;max-width:640px">
${styleMatch[0]}
${svgMatch[0]}
${seekScript}
</body>
</html>
`;
const linesPath = path.join(root, ".preview", "lines.html");
await writeFile(linesPath, linesOnlyPage, "utf8");
console.log(`lines-only render written: ${linesPath}`);
