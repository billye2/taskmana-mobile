// Bump the release version in manifest.json and package.json (see
// version-lib.mjs for the 1.0.9 -> 1.1.0 roll-over scheme).
import { readFileSync, writeFileSync } from 'node:fs';
import { bumpVersion } from './version-lib.mjs';

let next = '';
for (const file of ['manifest.json', 'package.json']) {
  const json = JSON.parse(readFileSync(file, 'utf8'));
  next = bumpVersion(json.version);
  json.version = next;
  writeFileSync(file, JSON.stringify(json, null, 2) + '\n');
  console.log(`${file}: -> ${next}`);
}

// Keep the service worker's cache key in step so every release invalidates
// the installed PWA's cached shell.
const sw = readFileSync('sw.js', 'utf8');
writeFileSync('sw.js', sw.replace(/const VERSION = '[^']+';/, `const VERSION = '${next}';`));
console.log(`sw.js: -> ${next}`);
