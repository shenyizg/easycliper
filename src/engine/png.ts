import { zlibSync } from 'fflate';

/**
 * Minimal PNG / APNG writer (no <canvas>, so no browser canvas-size limits).
 * - PNG: lossless stand-in for HEIC photos decoded by libheif.
 * - APNG: intermediate for animations only the browser can decode (animated WebP / AVIF);
 *   unlike image-sequence muxing it keeps an exact delay for every frame, including the last.
 */

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(parts: Uint8Array[]): number {
  let c = 0xffffffff;
  for (const p of parts) for (let i = 0; i < p.length; i++) c = CRC_TABLE[(c ^ p[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  const typeBytes = new TextEncoder().encode(type);
  dv.setUint32(0, data.length);
  out.set(typeBytes, 4);
  out.set(data, 8);
  dv.setUint32(8 + data.length, crc32([typeBytes, data]));
  return out;
}

function u32s(...values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 4);
  const dv = new DataView(out.buffer);
  values.forEach((v, i) => dv.setUint32(i * 4, v));
  return out;
}

/** RGBA pixels -> zlib stream of PNG scanlines using the "Up" filter (cheap, compresses photos well). */
function encodePixels(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  const stride = width * 4;
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const o = y * (stride + 1);
    const cur = y * stride;
    raw[o] = 2;
    if (y === 0) raw.set(rgba.subarray(0, stride), 1);
    else for (let i = 0; i < stride; i++) raw[o + 1 + i] = rgba[cur + i] - rgba[cur - stride + i];
  }
  return zlibSync(raw, { level: 4 });
}

function ihdr(width: number, height: number): Uint8Array {
  const data = new Uint8Array(13);
  const dv = new DataView(data.buffer);
  dv.setUint32(0, width);
  dv.setUint32(4, height);
  data.set([8, 6, 0, 0, 0], 8); // 8-bit RGBA, deflate, no filter, no interlace
  return chunk('IHDR', data);
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

const SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

export function encodePng(rgba: Uint8ClampedArray | Uint8Array, width: number, height: number): Uint8Array {
  return concat([SIGNATURE, ihdr(width, height), chunk('IDAT', encodePixels(rgba, width, height)), chunk('IEND', new Uint8Array(0))]);
}

/** Streams frames into an APNG; each frame is compressed as soon as it is added. */
export class ApngWriter {
  private parts: Uint8Array[] = [SIGNATURE];
  private seq = 0;
  private index = 0;
  /** Total display time in seconds. */
  duration = 0;

  constructor(
    private width: number,
    private height: number,
    frameCount: number,
    plays = 0,
  ) {
    this.parts.push(ihdr(width, height), chunk('acTL', u32s(frameCount, plays)));
  }

  /** `duration` in seconds; pixels must be width*height RGBA. */
  addFrame(rgba: Uint8ClampedArray | Uint8Array, duration: number): void {
    const ms = Math.max(1, Math.min(65535, Math.round(duration * 1000)));
    this.duration += ms / 1000;
    const fctl = new Uint8Array(26);
    const fv = new DataView(fctl.buffer);
    fv.setUint32(0, this.seq++);
    fv.setUint32(4, this.width);
    fv.setUint32(8, this.height);
    fv.setUint16(20, ms);
    fv.setUint16(22, 1000);
    // dispose 0 (none) / blend 0 (source): frames arrive fully composited
    this.parts.push(chunk('fcTL', fctl));
    const data = encodePixels(rgba, this.width, this.height);
    if (this.index++ === 0) this.parts.push(chunk('IDAT', data));
    else {
      const fdat = new Uint8Array(4 + data.length);
      new DataView(fdat.buffer).setUint32(0, this.seq++);
      fdat.set(data, 4);
      this.parts.push(chunk('fdAT', fdat));
    }
  }

  finish(): Uint8Array {
    this.parts.push(chunk('IEND', new Uint8Array(0)));
    return concat(this.parts);
  }
}

/** Sums the fcTL delays of an APNG, in seconds (ffprobe reports no duration for APNG). */
export function apngDuration(bytes: Uint8Array): number {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let off = 8;
  let total = 0;
  while (off + 12 <= bytes.length) {
    const len = dv.getUint32(off);
    const type = String.fromCharCode(bytes[off + 4], bytes[off + 5], bytes[off + 6], bytes[off + 7]);
    if (type === 'fcTL' && len >= 26) {
      const num = dv.getUint16(off + 8 + 20);
      const den = dv.getUint16(off + 8 + 22) || 100;
      // per spec a zero delay means "as fast as possible"; ffmpeg and browsers use ~0.1 s
      total += num === 0 ? 0.1 : num / den;
    }
    if (type === 'IEND') break;
    off += 12 + len;
  }
  return total;
}
