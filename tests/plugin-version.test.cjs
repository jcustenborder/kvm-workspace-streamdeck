'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { pluginVersion } = require('../scripts/plugin-version.cjs');

test('converts stable release versions to four-part Stream Deck versions', () => {
  assert.equal(pluginVersion('0.1.0'), '0.1.0.0');
  assert.equal(pluginVersion('12.34.56'), '12.34.56.0');
  assert.equal(pluginVersion('65535.65535.65535'), '65535.65535.65535.0');
});

test('rejects versions that cannot be packaged for Stream Deck', () => {
  for (const version of ['', 'v0.1.0', '01.1.0', '0.1', '0.1.0.0', '0.1.0-beta.1',
    '0.1.0+build', '-1.0.0', '1.0.0\n', '65536.0.0', '0.65536.0', '0.0.65536', 1, null]) {
    assert.throws(() => pluginVersion(version), /stable package version|65535/, String(version));
  }
});
