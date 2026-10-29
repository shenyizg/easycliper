// Copies the single-threaded ffmpeg.wasm core into public/ so it is served
// from the same origin (works on GitHub Pages without COOP/COEP headers).
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const coreDir = join(root, 'node_modules', '@ffmpeg', 'core');
if (!existsSync(coreDir)) {
  console.warn('[copy-ffmpeg-core] @ffmpeg/core not installed yet, skipping');
  process.exit(0);
}
const { version } = JSON.parse(readFileSync(join(coreDir, 'package.json'), 'utf8'));
const outRoot = join(root, 'public', 'ffmpeg');
const out = join(outRoot, version);
if (existsSync(join(out, 'ffmpeg-core.wasm'))) process.exit(0);

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
  cpSync(join(coreDir, 'dist', 'esm', f), join(out, f));
}
console.log(`[copy-ffmpeg-core] copied @ffmpeg/core ${version} -> public/ffmpeg/${version}/`);
