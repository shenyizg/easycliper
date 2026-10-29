/// <reference lib="webworker" />
// Decodes HEIC/HEIF with libheif and returns a PNG (encoded here, off the main thread).
import buildLibheif from 'libheif-js/libheif-wasm/libheif-bundle.mjs';
import { encodePng } from './png';

// Only the small JS wrapper libheif-js puts around the emscripten module is used.
interface HeifImage {
  is_primary(): boolean;
  get_width(): number;
  get_height(): number;
  display(target: ImageData, done: (result: ImageData | null) => void): void;
  free(): void;
}
interface Libheif {
  HeifDecoder: new () => { decoder: unknown; decode(data: Uint8Array): HeifImage[] };
  heif_context_free(ctx: unknown): void;
}

const libheif = (buildLibheif as () => Libheif)();

async function decode(buffer: ArrayBuffer): Promise<Uint8Array> {
  const decoder = new libheif.HeifDecoder();
  let images: HeifImage[] = [];
  try {
    images = decoder.decode(new Uint8Array(buffer));
    if (!images.length) throw new Error('no image found in HEIF file');
    // grid tiles that are not marked hidden can come before the primary image
    const image = images.find((i) => i.is_primary()) ?? images[0];
    const width = image.get_width();
    const height = image.get_height();
    const target = new ImageData(width, height);
    const pixels = await new Promise<ImageData>((resolve, reject) =>
      image.display(target, (d) => (d ? resolve(d) : reject(new Error('HEIF processing error')))),
    );
    return encodePng(pixels.data, width, height);
  } finally {
    for (const i of images) i.free();
    if (decoder.decoder) libheif.heif_context_free(decoder.decoder);
  }
}

self.onmessage = async (e: MessageEvent<{ id: number; buffer: ArrayBuffer }>) => {
  const { id, buffer } = e.data;
  try {
    const png = await decode(buffer);
    (self as unknown as DedicatedWorkerGlobalScope).postMessage({ id, png }, [png.buffer]);
  } catch (err) {
    self.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
