import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bumpVersion } from '../../scripts/version-lib.mjs';

test('bumpVersion counts each segment 0-9 with roll-over', () => {
  assert.equal(bumpVersion('1.0.0'), '1.0.1');
  assert.equal(bumpVersion('1.0.1'), '1.0.2');
  assert.equal(bumpVersion('1.0.8'), '1.0.9');
  assert.equal(bumpVersion('1.0.9'), '1.1.0');
  assert.equal(bumpVersion('1.1.9'), '1.2.0');
  assert.equal(bumpVersion('1.9.9'), '2.0.0');
  assert.equal(bumpVersion('2.0.0'), '2.0.1');
  assert.equal(bumpVersion('10.9.9'), '11.0.0');
});

test('bumpVersion rejects formats outside the scheme', () => {
  assert.throws(() => bumpVersion('1.0'), /Unsupported/);
  assert.throws(() => bumpVersion('1.10.0'), /Unsupported/);
  assert.throws(() => bumpVersion('1.0.10'), /Unsupported/);
  assert.throws(() => bumpVersion('v1.0.0'), /Unsupported/);
});
