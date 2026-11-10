import {gzipSync} from 'node:zlib';
import {readFile, readdir} from 'node:fs/promises';
import path from 'node:path';

// Compressed initial JS/CSS plus the route's primary fonts and logo. Dynamic
// imports, document HTML and user-supplied content are deliberately excluded.
const budgets = [
  {name:'首页', entry:'app/design/unified-preview/production-home.tsx', fonts:['home'], limit:370*1024},
  {name:'课程', entry:'app/learn/neural-networks/notebook.tsx', fonts:['home','course'], limit:560*1024},
  {name:'SNN AI', entry:'app/ai/ai-chat.tsx', fonts:['home','course','site'], limit:700*1024},
];
const common = ['virtual:vinext-app-browser-entry', 'app/_sections/UnifiedNav.tsx',
  'node_modules/vinext/dist/shims/layout-segment-context.js'];
const clientDir = path.resolve(process.env.SNN_PERF_CLIENT_DIR || 'dist/client');
const manifest = JSON.parse(await readFile(path.join(clientDir, '.vite/manifest.json'), 'utf8'));
const fontPaths = JSON.parse(await readFile('lib/design/fast-fonts.json', 'utf8'));
const siteSource = await readFile('lib/site.ts', 'utf8');
const logo = siteSource.match(/export const BRAND_LOGO\s*=\s*\{[^}]*?src:\s*["']([^"']+)["']/s)?.[1];
if (!logo) throw new Error('Cannot identify BRAND_LOGO for the performance budget.');
const globalCss = (await readdir(path.join(clientDir, 'assets')))
  .filter(name => /^index-[\w-]+\.css$/.test(name)).map(name => `assets/${name}`);
if (!globalCss.length) throw new Error('Cannot identify the global stylesheet for the performance budget.');

const sizeCache = new Map();
async function transferSize(file) {
  const relative = file.replace(/^\/+/, '');
  if (sizeCache.has(relative)) return sizeCache.get(relative);
  const absolute = path.resolve(clientDir, relative);
  if (!absolute.startsWith(clientDir + path.sep)) throw new Error(`Invalid asset path: ${file}`);
  const data = await readFile(absolute);
  const bytes = /\.(?:js|css|svg)$/i.test(relative) ? gzipSync(data).byteLength : data.byteLength;
  sizeCache.set(relative, bytes);
  return bytes;
}

let exceeded = false;
for (const budget of budgets) {
  const visited = new Set();
  const files = new Set([...globalCss, logo]);
  function visit(key) {
    if (visited.has(key)) return;
    visited.add(key);
    const chunk = manifest[key];
    if (!chunk) throw new Error(`Missing initial manifest entry: ${key}`);
    if (chunk.file) files.add(chunk.file);
    for (const css of chunk.css || []) files.add(css);
    for (const dependency of chunk.imports || []) visit(dependency);
  }
  for (const key of [...common, budget.entry]) visit(key);
  for (const font of budget.fonts) {
    if (!fontPaths[font]) throw new Error(`Missing ${font} font in fast-fonts.json`);
    files.add(fontPaths[font]);
  }
  if (visited.has('app/_components/markdown-content.mjs')) {
    throw new Error(`${budget.name}: the on-demand Markdown renderer became an initial dependency.`);
  }
  const sizes = await Promise.all([...files].map(transferSize));
  const total = sizes.reduce((sum, bytes) => sum + bytes, 0);
  const passed = total <= budget.limit;
  console.log(`${passed ? 'OK' : 'OVER'} ${budget.name}: ${(total/1024).toFixed(1)} KiB / ${budget.limit/1024} KiB`);
  if (!passed) exceeded = true;
}
if (exceeded) throw new Error('Initial asset budget exceeded; review the new dependencies before release.');
