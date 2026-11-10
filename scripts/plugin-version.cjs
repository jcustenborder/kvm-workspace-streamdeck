'use strict';

/** @param {string} version @returns {string} */
function pluginVersion(version) {
  const match = typeof version === 'string' && version.match(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
  if (!match || match[0] !== version) throw new Error('Expected a stable package version (X.Y.Z)');
  if (match.slice(1).some(part => Number(part) > 65535)) {
    throw new Error('Stream Deck version components must not exceed 65535');
  }
  return `${version}.0`;
}

module.exports = { pluginVersion };
