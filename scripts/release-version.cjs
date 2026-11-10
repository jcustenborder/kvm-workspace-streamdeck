'use strict';

const { pluginVersion } = require('./plugin-version.cjs');

/**
 * Same next-patch / same-commit policy as kvm-workspace/scripts/release-version.cjs.
 * @param {string} baseVersion
 * @param {Array<{tag_name:string,target_commitish:string,draft:boolean}>} releases
 * @param {string} commit
 * @returns {{version:string,tag:string,exists:boolean,published:boolean}}
 */
function planRelease(baseVersion, releases, commit) {
  pluginVersion(baseVersion);
  if (!commit) throw new Error('A release commit is required');
  const stable = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
  const versions = releases.filter(release => release.tag_name.startsWith('v') && stable.test(release.tag_name.slice(1)));
  const existing = versions.find(release => release.target_commitish === commit);
  if (existing) {
    const version = existing.tag_name.slice(1);
    pluginVersion(version);
    return { version, tag: existing.tag_name, exists: true, published: !existing.draft };
  }
  let next = baseVersion.split('.').map(Number);
  for (const release of versions) {
    const parts = release.tag_name.slice(1).split('.').map(Number);
    const difference = parts.map((value, index) => value - next[index]).find(value => value !== 0) ?? 0;
    if (difference >= 0) next = [parts[0], parts[1], parts[2] + 1];
  }
  const version = next.join('.');
  pluginVersion(version);
  return { version, tag: `v${version}`, exists: false, published: false };
}

if (require.main === module) {
  const { readFileSync, appendFileSync } = require('node:fs');
  const { version } = require('../package.json');
  const releases = JSON.parse(readFileSync(process.argv[2], 'utf8')).flat();
  const plan = planRelease(version, releases, process.env.GITHUB_SHA);
  console.log(`Release plan: ${JSON.stringify(plan)}`);
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(plan).map(([key, value]) => `${key}=${value}\n`).join(''));
}

module.exports = { planRelease };
