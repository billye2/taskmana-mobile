// Bump the release version in package.json (see version-lib.mjs for the
// 1.0.9 -> 1.1.0 roll-over scheme).
import { readFileSync, writeFileSync } from 'node:fs';
import { bumpVersion } from './version-lib.mjs';

const json = JSON.parse(readFileSync('package.json', 'utf8'));
const next = bumpVersion(json.version);
json.version = next;
writeFileSync('package.json', JSON.stringify(json, null, 2) + '\n');
console.log(`package.json: -> ${next}`);

// Keep the service worker's cache key in step so every release invalidates
// the installed PWA's cached shell.
const sw = readFileSync('sw.js', 'utf8');
writeFileSync('sw.js', sw.replace(/const VERSION = '[^']+';/, `const VERSION = '${next}';`));
console.log(`sw.js: -> ${next}`);

// The visible version line in More, so a phone can report what it runs.
const html = readFileSync('index.html', 'utf8');
writeFileSync('index.html', html.replace(/Version [0-9.]+</, `Version ${next}<`));
console.log(`index.html: -> ${next}`);
