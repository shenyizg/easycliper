# EasyCliper

**An open-source video & GIF clipper that runs entirely in your browser.** Open the page and start editing: all decoding and encoding happens locally with FFmpeg compiled to WebAssembly, and your files are never uploaded anywhere. It deploys as a static site (GitHub Pages works out of the box) and keeps working offline after the first visit.

The interface is in English, with Simplified Chinese available from the language toggle in the header.

[Features](#features) · [Formats](#supported-formats) · [How it works](#how-it-works) · [Deploy](#deploy-to-github-pages) · [Development](#local-development) · [Limitations](#known-limitations)

## Features

### Trim & export
- **Frame-accurate** start and end points: drag the timeline, step frame by frame with `←` / `→`, press `I` / `O`, or type the time directly
- **Crop** freely or with aspect presets (1:1, 4:3, 3:4, 16:9, 9:16, original); resize, change the frame rate, change speed from 0.25× to 4×, or drop the audio
- **Stream copy** mode: no re-encoding, so it finishes in seconds and is lossless (e.g. cutting the ends off a MOV, or rewrapping MOV → MP4)
- **Snapshot** the current frame from the player as a full-resolution PNG

### Frames
- Extract thumbnails from the selected range: every frame, every Nth frame, N per second, or N evenly spaced
- **Pick frames by hand**: click, drag to paint a selection, Shift-click for a range, select all / none / invert; double-click a thumbnail to view it in the player
- Export the picked frames at full resolution as PNG / JPG / WebP (multiple frames are zipped)
- Or **compose** the picked frames into a GIF, animated WebP, APNG, MP4 or WebM at a frame rate of your choice, with a live preview

### Convert
- Batch-convert several files at once, optionally applying each file's trim range and crop
- Convert between video, animation, audio and image formats, e.g. MOV → MP4, GIF → MP4, video → GIF, HEIC → JPG, video → MP3

## Supported formats

| Type | Input | Output |
| --- | --- | --- |
| Video | MP4, **MOV** (including iPhone HEVC and ProRes), MKV, WebM, AVI, FLV, WMV, TS/MTS, 3GP, MPEG, OGV… | MP4 (H.264), MOV, MKV, WebM (VP8), AVI (MPEG-4), OGV (Theora) |
| Animation | GIF, APNG, **animated WebP**, animated AVIF | GIF (adaptive palette), animated WebP, APNG |
| Image | **HEIC / HEIF** (including 24 MP iPhone photos), JPG, PNG, WebP, AVIF, BMP, TIFF | PNG, JPG, WebP, BMP, TIFF |
| Audio | MP3, AAC/M4A, WAV, FLAC, OGG, Opus, WMA… | MP3, M4A (AAC), WAV, OGG (Vorbis), Opus, FLAC |

Formats the browser cannot play natively (AVI, WMV, FLV, ProRes, GIF…) get a low-resolution preview first; exports always read the original file.

## How it works

| Part | Implementation |
| --- | --- |
| Encoding / decoding | The **single-threaded** build of [ffmpeg.wasm](https://github.com/ffmpegwasm/ffmpeg.wasm) (`@ffmpeg/core` 0.12), running in a Web Worker |
| Large files | User files are mounted through WORKERFS instead of being copied into wasm memory |
| HEIC / HEIF | [libheif](https://github.com/strukturag/libheif) (`libheif-js`) decodes in a worker and a built-in PNG encoder writes the result. No `<canvas>` is involved, so iOS Safari's canvas size limit does not apply |
| Animated WebP / AVIF | FFmpeg cannot decode these, so the browser's `ImageDecoder` decodes them frame by frame and they are repacked as an APNG with exact frame timing |
| Offline | A Service Worker generated at build time caches the page, scripts and FFmpeg core |

The single-threaded core does not need `SharedArrayBuffer`, so it **does not need COOP / COEP headers**. That is why it can be deployed as-is on static hosts like GitHub Pages, which do not let you set custom response headers.

## Deploy to GitHub Pages

1. Push this repository to GitHub (branch `main`).
2. Open the repository's **Settings → Pages** and set **Source** to **GitHub Actions**.
3. On every push, `.github/workflows/deploy.yml` builds and publishes the site to `https://<username>.github.io/<repository>/`.

The build uses relative paths (`base: './'`), so it works under any sub-path. You can also upload `dist/` to any other static web server.

## Local development

Requires Node.js 20.19+ or 22.12+.

```bash
npm install        # also copies the ffmpeg.wasm core to public/ffmpeg/<version>/
npm run dev        # development server
npm run build      # type-check and build to dist/
npm run preview    # serve the production build
```

Project layout:

```
src/
  engine/            FFmpeg wrapper (serial jobs, cancellation, automatic restart after a crash),
                     media probing, export argument builder, HEIC / animation decoding, PNG/APNG encoding
  jobs.ts            High-level jobs: preview proxies, export, snapshots, frame extraction, composing
  importer.ts        Import pipeline: format sniffing → decoding → probing → preview
  ui/                Player, timeline, crop box, the three tool panels, media library, outputs
  i18n.ts            UI strings (English and Simplified Chinese)
  sw.js              Service Worker template (the precache list is injected at build time)
```

## Known limitations

- **Speed**: encoding runs in single-threaded WebAssembly. Measured on an Apple M3 with Chrome: re-encoding 1080p to H.264 runs at about 10 fps (a 10-second clip takes about 30 seconds); a 10-second 1080p stream copy takes about 4 seconds; a 5-second 1080p clip to a 480p GIF takes about 4 seconds. The **Fast encode** option is roughly 2× faster at the cost of larger files.
- **No H.265 or VP9 output**: in the current ffmpeg.wasm core, libx265 never finishes encoding and libvpx-vp9 crashes, so WebM uses VP8. H.265 and VP9 **input** decodes fine.
- **No HEIC output**: there is no usable HEIC encoder in the browser; export JPG, PNG or WebP instead.
- **No AV1 video input**: the core has no AV1 decoder. (AVIF images are decoded by the browser and work.)
- **Memory**: wasm memory is capped at about 2 GB, so very large files or long high-resolution re-encodes may fail. When that happens the engine restarts automatically and shows an error.
- The first use downloads the FFmpeg core (about 32 MB); after that the browser caches it.
- **Browsers**: WebAssembly SIMD and module workers are required, i.e. Chrome / Edge 91+, Safari 16.4+, Firefox 114+. Animated WebP / AVIF also need `ImageDecoder`. Fully tested in Chrome and WebKit (Safari's engine); Firefox has not been tested yet.

## License

EasyCliper is released under **GPL-3.0-or-later** (see [LICENSE](LICENSE)), because the bundled ffmpeg.wasm core contains GPL components such as x264. Third-party components: the ffmpeg.wasm core (GPL-2.0-or-later), `@ffmpeg/ffmpeg` (MIT), libheif / `libheif-js` (LGPL-3.0), fflate (MIT).
