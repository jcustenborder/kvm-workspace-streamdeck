import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { pluginVersion } from './plugin-version.cjs';

const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('../plugin/manifest.json', import.meta.url), 'utf8'));
manifest.Version = pluginVersion(process.env.RELEASE_VERSION ?? pkg.version);
const output = `dist/${manifest.UUID}.sdPlugin`;

await rm('dist', { recursive: true, force: true });
await mkdir(output, { recursive: true });
await cp('plugin', output, { recursive: true });
await writeFile(`${output}/manifest.json`, `${JSON.stringify(manifest, null, 2)}\n`);
// PNGs are stored as base64 so all source assets remain text-editable.
const icons = JSON.parse(await readFile('assets/plugin-icons.json', 'utf8'));
for (const [name, data] of Object.entries(icons)) {
  await writeFile(`${output}/imgs/${name}`, Buffer.from(data, 'base64'));
}
await build({
  entryPoints: ['src/plugin.ts'],
  outfile: `${output}/bin/plugin.cjs`,
  bundle: true,
  platform: 'node',
  target: 'node24',
  format: 'cjs',
  logLevel: 'info',
});
console.log(`Built ${manifest.UUID} ${manifest.Version}`);
