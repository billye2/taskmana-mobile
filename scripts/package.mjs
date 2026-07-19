// Build dist/taskmana-<version>.zip containing only the files the extension
// needs at runtime (what "Load unpacked" actually uses).
import { readFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const { version } = JSON.parse(readFileSync('manifest.json', 'utf8'));
const out = `dist/taskmana-${version}.zip`;

mkdirSync('dist', { recursive: true });
rmSync(out, { force: true });
execFileSync('zip', ['-r', out, 'manifest.json', 'newtab.html', 'css', 'js', 'icons', 'README.md'], {
  stdio: 'inherit',
});
console.log(`built ${out}`);
