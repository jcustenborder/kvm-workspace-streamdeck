'use strict';

const { buildSync } = require('esbuild');
const Module = require('node:module');
const path = require('node:path');

module.exports = function loadTs(relativePath, dependencies = {}) {
  const filename = path.resolve(__dirname, relativePath);
  const result = buildSync({
    entryPoints: [filename], bundle: true, write: false,
    platform: 'node', format: 'cjs', target: 'node24', external: Object.keys(dependencies),
  });
  const loaded = new Module(filename, module);
  loaded.filename = filename;
  loaded.paths = Module._nodeModulePaths(path.dirname(filename));
  const originalRequire = loaded.require.bind(loaded);
  loaded.require = name => Object.hasOwn(dependencies, name) ? dependencies[name] : originalRequire(name);
  loaded._compile(result.outputFiles[0].text, filename);
  return loaded.exports;
};
