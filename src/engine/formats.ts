import type { MediaInfo } from './probe';

export type FormatGroup = 'video' | 'animation' | 'audio' | 'image';
export type MediaKind = 'video' | 'animation' | 'image' | 'audio';

export type FormatId =
  | 'mp4'
  | 'mov'
  | 'mkv'
  | 'webm'
  | 'avi'
  | 'ogv'
  | 'gif'
  | 'webp_anim'
  | 'apng'
  | 'mp3'
  | 'm4a'
  | 'wav'
  | 'ogg'
  | 'opus'
  | 'flac'
  | 'png'
  | 'jpg'
  | 'webp'
  | 'bmp'
  | 'tiff';

export interface FormatDef {
  id: FormatId;
  group: FormatGroup;
  ext: string;
  mime: string;
  label: string;
  /** Container accepts lossless stream copy (no re-encode). */
  copy?: boolean;
  /** Encoder needs even width/height (yuv420p). */
  even?: boolean;
}

export const FORMATS: FormatDef[] = [
  { id: 'mp4', group: 'video', ext: 'mp4', mime: 'video/mp4', label: 'MP4 (H.264)', copy: true, even: true },
  { id: 'mov', group: 'video', ext: 'mov', mime: 'video/quicktime', label: 'MOV (H.264)', copy: true, even: true },
  { id: 'mkv', group: 'video', ext: 'mkv', mime: 'video/x-matroska', label: 'MKV (H.264)', copy: true, even: true },
  // No H.265 / VP9 output: in the ffmpeg.wasm 0.12 core libx265 never finishes and
  // libvpx-vp9 crashes, so WebM is encoded as VP8. Both still decode fine as input.
  { id: 'webm', group: 'video', ext: 'webm', mime: 'video/webm', label: 'WebM (VP8)', copy: true, even: true },
  { id: 'avi', group: 'video', ext: 'avi', mime: 'video/x-msvideo', label: 'AVI (MPEG-4)', even: true },
  { id: 'ogv', group: 'video', ext: 'ogv', mime: 'video/ogg', label: 'OGV (Theora)', even: true },
  { id: 'gif', group: 'animation', ext: 'gif', mime: 'image/gif', label: 'GIF' },
  { id: 'webp_anim', group: 'animation', ext: 'webp', mime: 'image/webp', label: 'WebP (animated)' },
  { id: 'apng', group: 'animation', ext: 'png', mime: 'image/apng', label: 'APNG' },
  { id: 'mp3', group: 'audio', ext: 'mp3', mime: 'audio/mpeg', label: 'MP3' },
  { id: 'm4a', group: 'audio', ext: 'm4a', mime: 'audio/mp4', label: 'M4A (AAC)' },
  { id: 'wav', group: 'audio', ext: 'wav', mime: 'audio/wav', label: 'WAV' },
  { id: 'ogg', group: 'audio', ext: 'ogg', mime: 'audio/ogg', label: 'OGG (Vorbis)' },
  { id: 'opus', group: 'audio', ext: 'opus', mime: 'audio/ogg', label: 'Opus' },
  { id: 'flac', group: 'audio', ext: 'flac', mime: 'audio/flac', label: 'FLAC' },
  { id: 'png', group: 'image', ext: 'png', mime: 'image/png', label: 'PNG' },
  { id: 'jpg', group: 'image', ext: 'jpg', mime: 'image/jpeg', label: 'JPG' },
  { id: 'webp', group: 'image', ext: 'webp', mime: 'image/webp', label: 'WebP' },
  { id: 'bmp', group: 'image', ext: 'bmp', mime: 'image/bmp', label: 'BMP' },
  { id: 'tiff', group: 'image', ext: 'tif', mime: 'image/tiff', label: 'TIFF' },
];

export const GROUP_ORDER: FormatGroup[] = ['video', 'animation', 'audio', 'image'];

export function formatDef(id: FormatId): FormatDef {
  const def = FORMATS.find((f) => f.id === id);
  if (!def) throw new Error(`unknown format ${id}`);
  return def;
}

/** Output groups that make sense for a given source kind. */
export function groupsFor(kind: MediaKind, hasAudio: boolean): FormatGroup[] {
  switch (kind) {
    case 'video':
      return hasAudio ? ['video', 'animation', 'audio'] : ['video', 'animation'];
    case 'animation':
      return ['video', 'animation'];
    case 'image':
      return ['image', 'animation'];
    case 'audio':
      return ['audio'];
  }
}

export type Quality = 'high' | 'medium' | 'low';

export interface EncodeOptions {
  format: FormatId;
  /** Stream copy (fast, keyframe-aligned, no filters). */
  copy: boolean;
  /** Target length of the shorter side, 0 = keep. */
  shortSide: number;
  /** Explicit output width (keeps aspect), 0 = unset. Overrides shortSide. */
  width: number;
  /** Output frame rate, 0 = keep. */
  fps: number;
  quality: Quality;
  speed: number;
  audio: boolean;
  loop: boolean;
  /** H.264: x264 `ultrafast` (~2x faster in wasm, ~3x larger files). */
  fast: boolean;
}

export const defaultOptions = (format: FormatId = 'mp4'): EncodeOptions => ({
  format,
  copy: false,
  shortSide: 0,
  width: 0,
  fps: 0,
  quality: 'medium',
  speed: 1,
  audio: true,
  loop: true,
  fast: false,
});

export interface Segment {
  start: number;
  end: number;
}

export interface PixelCrop {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BuildRequest {
  input: string;
  output: string;
  info: MediaInfo;
  opts: EncodeOptions;
  segment?: Segment;
  crop?: PixelCrop;
  /** Filters placed first in the video chain (e.g. frame `select`). */
  preFilters?: string[];
  /** Fixed output frame rate; disables the fps filter (used when composing picked frames). */
  rate?: number;
  /** Image formats: write every frame to a numbered sequence instead of a single file. */
  sequence?: boolean;
}

export interface BuildResult {
  args: string[];
  /** Expected output duration (for progress). */
  duration: number;
  width: number;
  height: number;
}

/** Half a millisecond: keeps frame-aligned cut points from landing on the neighbouring frame. */
const EPS = 0.0005;

/**
 * Input-side trim. When re-encoding, ffmpeg drops frames before -ss exactly, so we nudge
 * the start back by EPS to keep the first frame. With stream copy ffmpeg starts at the last
 * keyframe <= -ss, so we nudge forward instead, or a keyframe sitting exactly on the start
 * would be missed and a whole extra GOP copied.
 */
export function segmentArgs(seg: Segment | undefined, copy = false): string[] {
  if (!seg) return [];
  const ss = copy ? (seg.start > 0 ? seg.start + EPS : 0) : seg.start > EPS ? seg.start - EPS : 0;
  const len = Math.max(0.001, seg.end - EPS - ss);
  const out: string[] = [];
  if (ss > 0) out.push('-ss', ss.toFixed(6));
  out.push('-t', len.toFixed(6));
  return out;
}

export function targetSize(w: number, h: number, o: Pick<EncodeOptions, 'width' | 'shortSide'>, even = false): [number, number] {
  let W = w;
  let H = h;
  if (o.width > 0) {
    W = o.width;
    H = (h * o.width) / w;
  } else if (o.shortSide > 0 && o.shortSide < Math.min(w, h)) {
    const k = o.shortSide / Math.min(w, h);
    W = w * k;
    H = h * k;
  }
  W = Math.max(1, Math.round(W));
  H = Math.max(1, Math.round(H));
  if (even) {
    W = Math.max(2, W - (W % 2));
    H = Math.max(2, H - (H % 2));
  }
  return [W, H];
}

export function fitCrop(c: PixelCrop, w: number, h: number, even: boolean): PixelCrop {
  let x = Math.max(0, Math.round(c.x));
  let y = Math.max(0, Math.round(c.y));
  let cw = Math.max(2, Math.min(w - x, Math.round(c.w)));
  let ch = Math.max(2, Math.min(h - y, Math.round(c.h)));
  if (even) {
    x -= x % 2;
    y -= y % 2;
    cw -= cw % 2;
    ch -= ch % 2;
  }
  return { x, y, w: cw, h: ch };
}

function atempo(speed: number): string {
  const parts: string[] = [];
  let s = speed;
  while (s > 2) {
    parts.push('atempo=2');
    s /= 2;
  }
  while (s < 0.5) {
    parts.push('atempo=0.5');
    s /= 0.5;
  }
  parts.push(`atempo=${+s.toFixed(4)}`);
  return parts.join(',');
}

export class BuildError extends Error {
  constructor(readonly code: 'noVideo' | 'noAudio') {
    super(code);
  }
}

export function buildArgs(r: BuildRequest): BuildResult {
  const def = formatDef(r.opts.format);
  const o = r.opts;
  const v = r.info.video;
  const copy = o.copy && !!def.copy;
  const args = ['-hide_banner', '-y', ...segmentArgs(r.segment, copy), '-i', r.input];
  let duration = r.segment ? r.segment.end - r.segment.start : r.info.duration;

  if (copy) {
    args.push('-map', '0:v:0?');
    if (o.audio) args.push('-map', '0:a:0?');
    else args.push('-an');
    args.push('-c', 'copy');
    if (def.ext === 'mp4' || def.ext === 'mov') {
      args.push('-movflags', '+faststart');
      if (v?.codec === 'hevc') args.push('-tag:v', 'hvc1');
    }
    args.push('-avoid_negative_ts', 'make_zero', r.output);
    return { args, duration, width: v?.displayWidth ?? 0, height: v?.displayHeight ?? 0 };
  }

  const Q = o.quality === 'high' ? 0 : o.quality === 'medium' ? 1 : 2;
  const group = def.group;
  const wantVideo = group !== 'audio';
  const wantAudio = group === 'audio' || (group === 'video' && o.audio && !!r.info.audio);
  if (wantVideo && !v) throw new BuildError('noVideo');
  if (group === 'audio' && !r.info.audio) throw new BuildError('noAudio');
  const timed = group === 'video' || group === 'animation' || group === 'audio';
  const speed = timed && o.speed > 0 ? o.speed : 1;

  const vf: string[] = [...(r.preFilters ?? [])];
  let outW = 0;
  let outH = 0;
  if (wantVideo && v) {
    let w = v.displayWidth;
    let hh = v.displayHeight;
    if (r.crop) {
      const c = fitCrop(r.crop, w, hh, !!def.even);
      vf.push(`crop=${c.w}:${c.h}:${c.x}:${c.y}`);
      w = c.w;
      hh = c.h;
    }
    if (speed !== 1) vf.push(`setpts=PTS/${speed}`);
    if (!r.rate && o.fps > 0 && group !== 'image') vf.push(`fps=${o.fps}`);
    [outW, outH] = targetSize(w, hh, o, !!def.even);
    if (outW !== w || outH !== hh) vf.push(`scale=${outW}:${outH}:flags=lanczos`, 'setsar=1');
  }

  const kbps = (arr: string[]) => arr[Q];
  let vargs: string[] = [];
  let aargs: string[] = [];
  switch (def.id) {
    case 'mp4':
    case 'mov':
    case 'mkv':
      vargs = ['-c:v', 'libx264', '-preset', o.fast ? 'ultrafast' : 'veryfast', '-crf', String([18, 23, 28][Q]), '-pix_fmt', 'yuv420p'];
      aargs = ['-c:a', 'aac', '-b:a', kbps(['192k', '128k', '96k'])];
      break;
    case 'webm': {
      const bits = Math.round((outW * outH * (o.fps || v?.fps || 30) * [0.12, 0.07, 0.035][Q]) / 1000);
      vargs = ['-c:v', 'libvpx', '-crf', String([6, 10, 20][Q]), '-b:v', `${Math.max(200, bits)}k`, '-deadline', 'realtime', '-cpu-used', '8', '-pix_fmt', 'yuv420p'];
      aargs = ['-c:a', 'libopus', '-b:a', kbps(['160k', '128k', '96k'])];
      break;
    }
    case 'avi':
      vargs = ['-c:v', 'mpeg4', '-vtag', 'xvid', '-q:v', String([2, 4, 7][Q]), '-pix_fmt', 'yuv420p'];
      aargs = ['-c:a', 'libmp3lame', '-b:a', kbps(['192k', '128k', '96k'])];
      break;
    case 'ogv':
      vargs = ['-c:v', 'libtheora', '-q:v', String([8, 6, 4][Q]), '-pix_fmt', 'yuv420p'];
      aargs = ['-c:a', 'libvorbis', '-q:a', String([6, 4, 2][Q])];
      break;
    case 'gif': {
      const colors = [256, 256, 128][Q];
      const dither = ['sierra2_4a', 'bayer:bayer_scale=3', 'bayer:bayer_scale=4'][Q];
      const head = vf.length ? vf.join(',') + ',' : '';
      vf.length = 0;
      vf.push(
        `${head}split[s0][s1];[s0]palettegen=max_colors=${colors}:stats_mode=${Q === 0 ? 'full' : 'diff'}[p];[s1][p]paletteuse=dither=${dither}:diff_mode=rectangle`,
      );
      vargs = ['-loop', o.loop ? '0' : '-1'];
      break;
    }
    case 'webp_anim':
      vargs = ['-c:v', 'libwebp_anim', '-lossless', '0', '-quality', String([90, 75, 55][Q]), '-compression_level', '4', '-loop', o.loop ? '0' : '1'];
      break;
    case 'apng':
      vargs = ['-c:v', 'apng', '-plays', o.loop ? '0' : '1', '-f', 'apng'];
      break;
    case 'mp3':
      aargs = ['-c:a', 'libmp3lame', '-q:a', String([0, 2, 5][Q])];
      break;
    case 'm4a':
      aargs = ['-c:a', 'aac', '-b:a', kbps(['256k', '192k', '128k']), '-movflags', '+faststart'];
      break;
    case 'wav':
      aargs = ['-c:a', 'pcm_s16le'];
      break;
    case 'ogg':
      aargs = ['-c:a', 'libvorbis', '-q:a', String([7, 5, 3][Q])];
      break;
    case 'opus':
      aargs = ['-c:a', 'libopus', '-b:a', kbps(['160k', '128k', '96k'])];
      break;
    case 'flac':
      aargs = ['-c:a', 'flac'];
      break;
    case 'png':
      vargs = ['-c:v', 'png'];
      break;
    case 'jpg':
      // the default "optimal" Huffman pass crashes or hangs in ffmpeg.wasm 0.12; standard tables are safe
      vargs = ['-c:v', 'mjpeg', '-huffman', '0', '-q:v', String([2, 4, 8][Q]), '-pix_fmt', 'yuvj420p'];
      break;
    case 'webp':
      vargs = ['-c:v', 'libwebp', '-quality', String([92, 80, 65][Q])];
      break;
    case 'bmp':
      vargs = ['-c:v', 'bmp'];
      break;
    case 'tiff':
      vargs = ['-c:v', 'tiff'];
      break;
  }

  if (wantVideo) args.push('-map', '0:v:0');
  if (wantAudio) {
    args.push('-map', '0:a:0');
    if (speed !== 1) args.push('-af', atempo(speed));
    args.push(...aargs);
  } else {
    args.push('-an');
  }
  if (!wantVideo) args.push('-vn');
  if (vf.length) args.push('-vf', vf.join(','));
  args.push(...vargs);
  if (group === 'image') {
    if (r.sequence) args.push('-fps_mode', 'passthrough');
    else args.push('-frames:v', '1', '-update', '1');
  }
  if (r.rate) args.push('-r', String(r.rate));
  if (def.ext === 'mp4' || def.ext === 'mov') {
    if (!args.includes('-movflags')) args.push('-movflags', '+faststart');
  }
  args.push(r.output);
  return { args, duration: duration / speed, width: outW, height: outH };
}
