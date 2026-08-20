// Rasterize icons/icon.svg to the PWA's PNG icon sizes.
// Same T-tile source as the extension (billye2/taskmana) — keep them in step.
// Run: npm run gen:icons
import { Resvg } from '@resvg/resvg-js';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const svg = readFileSync(join(root, 'icons/icon.svg'), 'utf8');

for (const size of [16, 48, 128, 180, 192, 512]) {
  const png = new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng();
  writeFileSync(join(root, `icons/icon${size}.png`), png);
  console.log(`icon${size}.png  (${png.length} bytes)`);
}
