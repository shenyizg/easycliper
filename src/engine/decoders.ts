import { ApngWriter } from './png';

export type Sniff = 'heic' | 'avif' | 'webp' | 'webp-anim' | 'other';

const HEIF_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'hevm', 'hevs', 'mif1', 'msf1']);

/** Looks at magic bytes for formats the bundled ffmpeg cannot decode on its own. */
export async function sniff(file: Blob, name: string): Promise<Sniff> {
  const b = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const str = (s: number, e: number) => String.fromCharCode(...b.slice(s, e));
  if (b.length >= 16 && str(4, 8) === 'ftyp') {
    const size = Math.min(b.length, ((b[0] << 24) | (b[1] << 16) | (b[2] << 8) | b[3]) >>> 0);
    const brands = [str(8, 12)];
    for (let i = 16; i + 4 <= size; i += 4) brands.push(str(i, i + 4));
    if (brands.includes('avif') || brands.includes('avis')) return 'avif';
    if (HEIF_BRANDS.has(brands[0]) || brands.some((x) => x === 'heic' || x === 'heix')) return 'heic';
  }
  if (b.length >= 21 && str(0, 4) === 'RIFF' && str(8, 12) === 'WEBP') {
    return str(12, 16) === 'VP8X' && b[20] & 0x02 ? 'webp-anim' : 'webp';
  }
  if (/\.(heic|heif|hif)$/i.test(name)) return 'heic';
  if (/\.avif$/i.test(name)) return 'avif';
  return 'other';
}

let heicWorker: Worker | null = null;
let heicSeq = 0;

/**
 * HEIC/HEIF -> PNG via libheif (wasm) in a worker. Pixels never touch a <canvas>, so
 * 24/48 MP iPhone photos also work on iOS Safari (which caps canvases at ~16.7 MP).
 */
export function decodeHeic(file: Blob): Promise<Blob> {
  heicWorker ??= new Worker(new URL('./heic.worker.ts', import.meta.url), { type: 'module' });
  const worker = heicWorker;
  const id = ++heicSeq;
  return file.arrayBuffer().then(
    (buffer) =>
      new Promise<Blob>((resolve, reject) => {
        const onMessage = (e: MessageEvent<{ id: number; png?: Uint8Array; error?: string }>) => {
          if (e.data.id !== id) return;
          worker.removeEventListener('message', onMessage);
          if (e.data.png) resolve(new Blob([e.data.png as BlobPart], { type: 'image/png' }));
          else reject(new Error(e.data.error ?? 'HEIC decode failed'));
        };
        worker.addEventListener('message', onMessage);
        worker.postMessage({ id, buffer }, [buffer]);
      }),
  );
}

async function canvasToPng(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('encode failed'))), 'image/png'),
  );
}

/** Still image the browser can decode but ffmpeg cannot (e.g. AVIF) -> PNG. */
export async function decodeStillWithBrowser(file: Blob): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bmp.width;
  canvas.height = bmp.height;
  canvas.getContext('2d')!.drawImage(bmp, 0, 0);
  bmp.close();
  return canvasToPng(canvas);
}

// Minimal typing for the WebCodecs ImageDecoder (not in every TS DOM lib yet).
interface DecodedFrame {
  displayWidth: number;
  displayHeight: number;
  duration: number | null;
  close(): void;
}
interface ImageDecoderLike {
  tracks: { ready: Promise<void>; selectedTrack: { frameCount: number } | null };
  completed: Promise<void>;
  decode(o: { frameIndex: number }): Promise<{ image: DecodedFrame }>;
  close(): void;
}
interface ImageDecoderCtor {
  new (init: { data: ReadableStream | BufferSource; type: string }): ImageDecoderLike;
  isTypeSupported(type: string): Promise<boolean>;
}

const ImageDecoderImpl = (globalThis as { ImageDecoder?: ImageDecoderCtor }).ImageDecoder;


export type BrowserDecoded =
  | { kind: 'still'; png: Blob }
  | { kind: 'animation'; apng: Uint8Array; frames: number; duration: number };

/**
 * Decodes an animated image (animated WebP / AVIF) with the browser's own decoder and
 * re-packs it as APNG, which ffmpeg reads natively with exact per-frame timing.
 */
export async function decodeAnimationWithBrowser(
  file: Blob,
  mime: string,
  onProgress?: (r: number) => void,
): Promise<BrowserDecoded> {
  if (!ImageDecoderImpl || !(await ImageDecoderImpl.isTypeSupported(mime))) throw new Error('noImageDecoder');
  const dec = new ImageDecoderImpl({ data: await file.arrayBuffer(), type: mime });
  try {
    await dec.tracks.ready;
    await dec.completed;
    const count = dec.tracks.selectedTrack?.frameCount ?? 1;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    let writer: ApngWriter | null = null;
    for (let i = 0; i < count; i++) {
      const { image } = await dec.decode({ frameIndex: i });
      if (i === 0) {
        canvas.width = image.displayWidth;
        canvas.height = image.displayHeight;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(image as unknown as CanvasImageSource, 0, 0);
      const us = image.duration && image.duration > 0 ? image.duration : 100_000;
      image.close();
      if (count === 1) return { kind: 'still', png: await canvasToPng(canvas) };
      writer ??= new ApngWriter(canvas.width, canvas.height, count);
      writer.addFrame(ctx.getImageData(0, 0, canvas.width, canvas.height).data, us / 1e6);
      onProgress?.((i + 1) / count);
    }
    return { kind: 'animation', apng: writer!.finish(), frames: count, duration: writer!.duration };
  } finally {
    dec.close();
  }
}
