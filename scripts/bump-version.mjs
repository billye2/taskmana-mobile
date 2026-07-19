// Bump the release version in manifest.json and package.json (see
// version-lib.mjs for the 1.0.9 -> 1.1.0 roll-over scheme).
import { readFileSync, writeFileSync } from 'node:fs';
import { bumpVersion } from './version-lib.mjs';

for (const file of ['manifest.json', 'package.json']) {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  const next = bumpVersion(json.version);
  json.version = next;
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  console.log(`${file}: -> ${next}`);
}
