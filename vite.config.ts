import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const coreVersion: string = JSON.parse(
  readFileSync(new URL('./node_modules/@ffmpeg/core/package.json', import.meta.url), 'utf8'),
).version;

/**
 * Emits sw.js with the list of built files to precache, so lazily loaded chunks
 * (e.g. the HEIC decoder) also work offline. The 32 MB wasm is cached on first use instead.
 */
function serviceWorker(): Plugin {
  return {
    name: 'easycliper-sw',
    apply: 'build',
    generateBundle(_, bundle) {
      const built = Object.keys(bundle).filter((f) => f !== 'index.html' && !f.endsWith('.map'));
      const precache = ['./', ...built, 'favicon.svg', 'manifest.webmanifest', `ffmpeg/${coreVersion}/ffmpeg-core.js`];
      const source = readFileSync(new URL('./src/sw.js', import.meta.url), 'utf8').replace(
        'self.__PRECACHE__',
        JSON.stringify(precache),
      );
      this.emitFile({ type: 'asset', fileName: 'sw.js', source });
    },
  };
}

export default defineConfig({
  // Relative base so the build works under https://<user>.github.io/<repo>/
  base: './',
  define: {
    __FFMPEG_CORE_VERSION__: JSON.stringify(coreVersion),
  },
  plugins: [serviceWorker()],
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg'],
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 4096,
  },
});
