/** High-level ffmpeg jobs built on top of the engine and the argument builder. */
import { engine } from './engine/ffmpeg';
import {
  buildArgs,
  defaultOptions,
  formatDef,
  segmentArgs,
  type EncodeOptions,
  type PixelCrop,
  type Quality,
  type Segment,
} from './engine/formats';
import type { MediaInfo } from './engine/probe';
import type { MediaItem } from './state';

type OnProgress = (ratio: number) => void;

const even = (n: number) => Math.max(2, Math.round(n) - (Math.round(n) % 2));

export function cropPixels(item: MediaItem): PixelCrop | undefined {
  const v = item.info?.video;
  if (!item.crop || !v) return undefined;
  return {
    x: item.crop.x * v.displayWidth,
    y: item.crop.y * v.displayHeight,
    w: item.crop.w * v.displayWidth,
    h: item.crop.h * v.displayHeight,
  };
}

const blobOf = (data: Uint8Array, type: string) => new Blob([data as BlobPart], { type });

/** Browsers without H.264 (some Linux builds) get a VP8/WebM preview instead. */
const proxyAsWebm = (): boolean =>
  !document.createElement('video').canPlayType('video/mp4; codecs="avc1.42E01E"') &&
  !!document.createElement('video').canPlayType('video/webm; codecs="vp8"');

/** Low-res stand-in for files the browser cannot play (AVI, WMV, FLV, ProRes, GIF…). */
export function makeVideoProxy(
  source: File,
  info: MediaInfo,
  withAudio: boolean,
  signal: AbortSignal,
  onProgress: OnProgress,
): Promise<Blob> {
  return engine.run(async (ctx) => {
    const input = await ctx.input(source, source.name);
    const v = info.video!;
    const k = Math.min(1, 480 / Math.min(v.displayWidth, v.displayHeight), 854 / Math.max(v.displayWidth, v.displayHeight));
    const w = even(v.displayWidth * k);
    const h = even(v.displayHeight * k);
    const gop = Math.max(1, Math.min(30, Math.round(v.fps / 2)));
    const webm = proxyAsWebm();
    const out = `${ctx.dir}/proxy.${webm ? 'webm' : 'mp4'}`;
    const hasAudio = withAudio && !!info.audio;
    const codec = webm
      ? ['-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', '-b:v', '1M', ...(hasAudio ? ['-c:a', 'libopus', '-b:a', '96k'] : [])]
      : ['-c:v', 'libx264', '-preset', 'ultrafast', '-crf', '26', '-movflags', '+faststart', ...(hasAudio ? ['-c:a', 'aac', '-b:a', '96k'] : [])];
    await ctx.exec(
      [
        '-hide_banner', '-i', input, '-map', '0:v:0', ...(hasAudio ? ['-map', '0:a:0', '-ac', '2'] : ['-an']),
        '-vf', `scale=${w}:${h}:flags=bilinear,format=yuv420p`, '-g', String(gop),
        ...codec, '-fps_mode', 'passthrough', out,
      ],
      { duration: info.duration, onProgress },
    );
    return blobOf(await ctx.read(out), webm ? 'video/webm' : 'video/mp4');
  }, signal);
}

export function makeAudioProxy(source: File, info: MediaInfo, signal: AbortSignal, onProgress: OnProgress): Promise<Blob> {
  return engine.run(async (ctx) => {
    const input = await ctx.input(source, source.name);
    const out = `${ctx.dir}/proxy.m4a`;
    await ctx.exec(['-hide_banner', '-i', input, '-vn', '-map', '0:a:0', '-c:a', 'aac', '-b:a', '128k', out], {
      duration: info.duration,
      onProgress,
    });
    return blobOf(await ctx.read(out), 'audio/mp4');
  }, signal);
}

/** First frame of anything ffmpeg can decode -> PNG (preview for e.g. TIFF in Chrome). */
export function stillToPng(source: File, signal: AbortSignal): Promise<Blob> {
  return engine.run(async (ctx) => {
    const input = await ctx.input(source, source.name);
    const out = `${ctx.dir}/still.png`;
    await ctx.exec(['-hide_banner', '-i', input, '-map', '0:v:0', '-frames:v', '1', '-update', '1', out]);
    return blobOf(await ctx.read(out), 'image/png');
  }, signal);
}

export interface EncodeTarget {
  segment?: Segment;
  crop?: PixelCrop;
}

export function encodeItem(
  item: MediaItem,
  opts: EncodeOptions,
  target: EncodeTarget,
  signal: AbortSignal,
  onProgress: OnProgress,
): Promise<Blob> {
  return engine.run(async (ctx) => {
    const def = formatDef(opts.format);
    const input = await ctx.input(item.source, item.source.name);
    const output = `${ctx.dir}/out.${def.ext}`;
    const b = buildArgs({ input, output, info: item.info!, opts, segment: target.segment, crop: target.crop });
    await ctx.exec(b.args, { duration: b.duration, onProgress });
    return blobOf(await ctx.read(output), def.mime);
  }, signal);
}

export function snapshotFrame(item: MediaItem, time: number, crop: PixelCrop | undefined, signal: AbortSignal): Promise<Blob> {
  const fps = item.info?.video?.fps || 30;
  return encodeItem(item, defaultOptions('png'), { segment: { start: time, end: time + 1 / fps }, crop }, signal, () => {});
}

// ---------------------------------------------------------------------------
// Frame extraction

export interface ExtractedFrame {
  /** Index of the frame inside the segment (input to the `select` filter). */
  n: number;
  /** Absolute time in the source, seconds. */
  time: number;
  /** Absolute frame number in the source. */
  frame: number;
  url: string;
}

/**
 * select expression for picked thumbnails. `indices` are thumbnail positions; with a
 * sampling step of `step`, thumbnail i is segment frame i*step. Consecutive runs are
 * collapsed so the expression stays short even for thousands of frames.
 */
export function selectExpr(indices: number[], step: number): string {
  const s = [...new Set(indices)].sort((a, b) => a - b);
  const parts: string[] = [];
  for (let i = 0; i < s.length; ) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    const a = s[i] * step;
    const b = s[j] * step;
    if (a === b) parts.push(`eq(n\\,${a})`);
    else if (step === 1) parts.push(`between(n\\,${a}\\,${b})`);
    else parts.push(`between(n\\,${a}\\,${b})*not(mod(n\\,${step}))`);
    i = j + 1;
  }
  return parts.join('+') || '0';
}

const SHOWINFO = /n:\s*(\d+)\s+pts:\s*-?\d+\s+pts_time:\s*(-?[\d.]+(?:e[-+]?\d+)?)/;

export function extractThumbnails(
  item: MediaItem,
  segment: Segment,
  step: number,
  signal: AbortSignal,
  onProgress: OnProgress,
): Promise<ExtractedFrame[]> {
  return engine.run(async (ctx) => {
    const v = item.info!.video!;
    const fps = v.fps;
    const long = Math.max(v.displayWidth, v.displayHeight);
    const k = Math.min(1, 240 / long);
    const tw = even(v.displayWidth * k);
    const th = even(v.displayHeight * k);
    const input = await ctx.input(item.source, item.source.name);
    const segArgs = segmentArgs(segment);
    const ss = segArgs[0] === '-ss' ? parseFloat(segArgs[1]) : 0;
    const times = new Map<number, number>();
    await ctx.exec(
      [
        '-hide_banner', ...segArgs, '-i', input, '-map', '0:v:0', '-an',
        '-vf', `select='not(mod(n\\,${step}))',showinfo,scale=${tw}:${th}:flags=bilinear`,
        '-fps_mode', 'passthrough', '-huffman', '0', '-q:v', '5', `${ctx.dir}/t_%06d.jpg`,
      ],
      {
        duration: segment.end - segment.start,
        onProgress: (r) => onProgress(r * 0.9),
        onLog: (line) => {
          const m = SHOWINFO.exec(line);
          if (m) times.set(+m[1], parseFloat(m[2]));
        },
      },
    );
    const files = (await ctx.list()).filter((f) => /\/t_\d+\.jpg$/.test(f));
    const frames: ExtractedFrame[] = [];
    for (let i = 0; i < files.length; i++) {
      const data = await ctx.read(files[i]);
      await ctx.remove(files[i]);
      const rel = times.get(i);
      const time = rel != null ? ss + rel : segment.start + (i * step) / fps;
      frames.push({
        n: i * step,
        time,
        frame: Math.round(time * fps),
        url: URL.createObjectURL(blobOf(data, 'image/jpeg')),
      });
      if (i % 20 === 0) onProgress(0.9 + (0.1 * i) / files.length);
    }
    return frames;
  }, signal);
}

export interface FrameExportOptions {
  format: 'png' | 'jpg' | 'webp';
  shortSide: number;
  quality: Quality;
}

/** Full-resolution export of picked frames. Returns files in frame order. */
export function exportFrames(
  item: MediaItem,
  segment: Segment,
  step: number,
  indices: number[],
  opts: FrameExportOptions,
  crop: PixelCrop | undefined,
  signal: AbortSignal,
  onProgress: OnProgress,
): Promise<Uint8Array[]> {
  return engine.run(async (ctx) => {
    const def = formatDef(opts.format);
    const input = await ctx.input(item.source, item.source.name);
    const b = buildArgs({
      input,
      output: `${ctx.dir}/x_%06d.${def.ext}`,
      info: item.info!,
      opts: { ...defaultOptions(opts.format), shortSide: opts.shortSide, quality: opts.quality },
      segment,
      crop,
      preFilters: [`select='${selectExpr(indices, step)}'`],
      sequence: true,
    });
    await ctx.exec(b.args, { duration: segment.end - segment.start, onProgress: (r) => onProgress(r * 0.9) });
    const files = (await ctx.list()).filter((f) => /\/x_\d+\./.test(f));
    const out: Uint8Array[] = [];
    for (const f of files) {
      out.push(await ctx.read(f));
      await ctx.remove(f);
    }
    return out;
  }, signal);
}

/** Builds an animation / video out of the picked frames, played back at `rate` fps. */
export function composeFrames(
  item: MediaItem,
  segment: Segment,
  step: number,
  indices: number[],
  opts: EncodeOptions,
  rate: number,
  crop: PixelCrop | undefined,
  signal: AbortSignal,
  onProgress: OnProgress,
): Promise<Blob> {
  return engine.run(async (ctx) => {
    const def = formatDef(opts.format);
    const input = await ctx.input(item.source, item.source.name);
    const output = `${ctx.dir}/compose.${def.ext}`;
    const b = buildArgs({
      input,
      output,
      info: item.info!,
      opts: { ...opts, audio: false, fps: 0, speed: 1, copy: false },
      segment,
      crop,
      preFilters: [`select='${selectExpr(indices, step)}'`, `setpts=N/(${rate}*TB)`],
      rate,
    });
    await ctx.exec(b.args, { duration: indices.length / rate, onProgress });
    return blobOf(await ctx.read(output), def.mime);
  }, signal);
}
