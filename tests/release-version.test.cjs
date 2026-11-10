'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { planRelease } = require('../scripts/release-version.cjs');

test('starts at the package version and advances past published and reserved stable tags', () => {
  assert.deepEqual(planRelease('0.1.0', [], 'new'), {
    version: '0.1.0', tag: 'v0.1.0', exists: false, published: false,
  });
  const releases = [
    { tag_name: 'v0.1.9', target_commitish: 'old', draft: false },
    { tag_name: 'v0.1.2', target_commitish: 'older', draft: false },
    { tag_name: 'v0.1.10', target_commitish: 'reserved', draft: true },
    { tag_name: 'v9.0.0-beta.1', target_commitish: 'beta', draft: false },
    { tag_name: 'unrelated', target_commitish: 'other', draft: false },
  ];
  assert.equal(planRelease('0.1.0', releases, 'new').version, '0.1.11');
  assert.equal(planRelease('0.2.0', releases, 'new').version, '0.2.0');
  assert.equal(planRelease('0.1.0', [
    { tag_name: 'v2.3.4', target_commitish: 'old', draft: false },
    ...releases,
  ], 'new').version, '2.3.5');
});

test('reuses an exact commit release on reruns, including unfinished drafts', () => {
  for (const draft of [true, false]) {
    assert.deepEqual(planRelease('0.1.0', [
      { tag_name: 'v0.1.3', target_commitish: 'same', draft },
      { tag_name: 'v0.1.4', target_commitish: 'other', draft: false },
    ], 'same'), { version: '0.1.3', tag: 'v0.1.3', exists: true, published: !draft });
  }
});

test('rejects invalid versions, missing commits, and exhausted Stream Deck version components', () => {
  assert.throws(() => planRelease('0.1.0-beta.1', [], 'commit'), /stable package version/);
  assert.throws(() => planRelease('0.1.0', [], ''), /commit/);
  assert.throws(() => planRelease('65536.0.0', [], 'commit'), /65535/);
  assert.throws(() => planRelease('0.1.0', [
    { tag_name: 'v1.0.65535', target_commitish: 'old', draft: false },
  ], 'new'), /65535/);
});
