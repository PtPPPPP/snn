import { writeFile } from 'node:fs/promises';
import { foundation, VALUE_COLOR_STOPS } from '../lib/design/tokens.ts';
const gradient = VALUE_COLOR_STOPS.map(({ value, color }) => `${color} ${(value + 2) / 4 * 100}%`).join(', ');
const css = `/* Generated from lib/design/tokens.ts. Run node scripts/generate-design-tokens.mjs. */\n:root {\n${Object.entries(foundation).map(([name, value]) => `  --${name}: ${value};`).join('\n')}\n  --value-gradient: linear-gradient(90deg, ${gradient});\n}\n`;
await writeFile(new URL('../app/design-foundation.css', import.meta.url), css);
