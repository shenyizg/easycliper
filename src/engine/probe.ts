import { engine } from './ffmpeg';

export interface VideoStreamInfo {
  codec: string;
  width: number;
  height: number;
  /** Size after applying rotation metadata, i.e. what the viewer sees and what ffmpeg filters receive. */
  displayWidth: number;
  displayHeight: number;
  rotation: number;
  fps: number;
  frames: number;
  pixFmt: string;
}

export interface AudioStreamInfo {
  codec: string;
  sampleRate: number;
  channels: number;
}

export interface MediaInfo {
  format: string;
  duration: number;
  bitRate: number;
  video?: VideoStreamInfo;
  audio?: AudioStreamInfo;
}

interface ProbeStream {
  codec_type?: string;
  codec_name?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  nb_frames?: string;
  nb_read_frames?: string;
  duration?: string;
  sample_rate?: string;
  channels?: number;
  disposition?: { attached_pic?: number };
  tags?: Record<string, string>;
  side_data_list?: { rotation?: number }[];
}

interface ProbeJson {
  streams?: ProbeStream[];
  format?: { format_name?: string; duration?: string; bit_rate?: string };
}

function rate(s?: string): number {
  if (!s) return 0;
  const [a, b] = s.split('/').map(Number);
  if (!b) return a || 0;
  return a / b;
}

const num = (s?: string): number => {
  const v = s == null ? NaN : parseFloat(s);
  return Number.isFinite(v) ? v : 0;
};

export function parseProbe(json: ProbeJson): MediaInfo {
  const streams = json.streams ?? [];
  const fmt = json.format ?? {};
  const v = streams.find((s) => s.codec_type === 'video' && !s.disposition?.attached_pic);
  const a = streams.find((s) => s.codec_type === 'audio');
  let duration = num(fmt.duration);
  if (!duration) duration = Math.max(num(v?.duration), num(a?.duration));

  const info: MediaInfo = {
    format: fmt.format_name ?? '',
    duration,
    bitRate: num(fmt.bit_rate),
  };

  if (v && v.width && v.height) {
    const avg = rate(v.avg_frame_rate);
    const r = rate(v.r_frame_rate);
    let fps = avg > 0 && avg <= 240 ? avg : r > 0 && r <= 240 ? r : 0;
    const counted = num(v.nb_read_frames) || num(v.nb_frames);
    if (!fps) fps = counted > 1 && duration > 0 ? counted / duration : 25;
    if (!duration && counted > 1) duration = counted / fps;
    info.duration = duration;
    const rotation = Math.round(
      v.side_data_list?.find((d) => typeof d.rotation === 'number')?.rotation ?? num(v.tags?.rotate),
    );
    const swap = Math.abs(rotation) % 180 === 90;
    info.video = {
      codec: v.codec_name ?? '?',
      width: v.width,
      height: v.height,
      displayWidth: swap ? v.height : v.width,
      displayHeight: swap ? v.width : v.height,
      rotation,
      fps,
      frames: counted || Math.max(1, Math.round(duration * fps)),
      pixFmt: v.pix_fmt ?? '',
    };
  }
  if (a) {
    info.audio = {
      codec: a.codec_name ?? '?',
      sampleRate: num(a.sample_rate),
      channels: a.channels ?? 0,
    };
  }
  return info;
}

export function probe(blob: Blob, name: string, countFrames = false, signal?: AbortSignal): Promise<MediaInfo> {
  return engine.run(async (ctx) => {
    const path = await ctx.input(blob, name);
    const out = `${ctx.dir}/probe.json`;
    const args = ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams'];
    if (countFrames) args.push('-count_frames');
    args.push(path, '-o', out);
    await ctx.ffprobe(args);
    let raw: Uint8Array;
    try {
      raw = await ctx.read(out);
    } catch {
      throw new Error('unrecognized');
    }
    const json = JSON.parse(new TextDecoder().decode(raw)) as ProbeJson;
    if (!json.streams?.length) throw new Error('unrecognized');
    return parseProbe(json);
  }, signal);
}

/** Container formats ffmpeg reports for single still images. */
export function isStillImageFormat(format: string): boolean {
  return /(^|,)image2($|,)|_pipe($|,)/.test(format);
}
