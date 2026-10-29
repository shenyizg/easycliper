import { FFmpeg, type FFFSType } from '@ffmpeg/ffmpeg';
import { Emitter } from '../utils';

declare const __FFMPEG_CORE_VERSION__: string;

export type EngineStatus = 'idle' | 'loading' | 'ready' | 'error';

export class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledError';
  }
}

export class FFmpegError extends Error {
  constructor(
    message: string,
    readonly log: string[],
  ) {
    super(message);
    this.name = 'FFmpegError';
  }
}

/** The wasm instance threw (e.g. out of memory); it is discarded and restarted. */
export class EngineCrashError extends Error {
  constructor(readonly detail: string) {
    super(detail);
    this.name = 'EngineCrashError';
  }
}

export interface ExecOptions {
  /** Expected output duration in seconds, used to turn `time=` log lines into a ratio. */
  duration?: number;
  onProgress?: (ratio: number) => void;
  onLog?: (line: string) => void;
}

export interface JobContext {
  /** Per-job scratch directory in the in-memory FS. Removed after the job. */
  readonly dir: string;
  /** Mounts a Blob/File read-only (WORKERFS, no copy into wasm memory) and returns its path. */
  input(blob: Blob, name: string): Promise<string>;
  write(name: string, data: Uint8Array | string): Promise<string>;
  read(path: string): Promise<Uint8Array>;
  /** Files (not dirs) in the job directory, sorted by name. */
  list(): Promise<string[]>;
  remove(path: string): Promise<void>;
  /** Runs ffmpeg; throws FFmpegError on a non-zero exit code. Returns the captured log. */
  exec(args: string[], opts?: ExecOptions): Promise<string[]>;
  ffprobe(args: string[]): Promise<number>;
}

const LOG_LIMIT = 4000;

function parseClock(s: string): number {
  const m = /(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : NaN;
}

/** Pulls the most useful line out of an ffmpeg log for an error message. */
function summarize(log: string[]): string {
  const interesting = log.filter((l) =>
    /error|invalid|not supported|unsupported|unknown|could not|cannot|failed|no such|does not|incorrect|not found|conversion failed/i.test(l),
  );
  const line = interesting.at(-1) ?? log.at(-1) ?? 'ffmpeg failed';
  return line.replace(/^\[[^\]]+\]\s*/, '').trim();
}

class Engine {
  status: EngineStatus = 'idle';
  loadProgress = 0;
  readonly statusChanged = new Emitter<EngineStatus>();
  readonly busyChanged = new Emitter<boolean>();

  private ff: FFmpeg | null = null;
  private loading: Promise<FFmpeg> | null = null;
  private chain: Promise<unknown> = Promise.resolve();
  private sink: ((line: string) => void) | null = null;
  private jobSeq = 0;
  private terminated = false;
  private active = 0;
  private wasmBlobUrl: string | null = null;

  private setStatus(s: EngineStatus) {
    this.status = s;
    this.statusChanged.emit(s);
  }

  get busy(): boolean {
    return this.active > 0;
  }

  load(): Promise<FFmpeg> {
    if (this.ff) return Promise.resolve(this.ff);
    if (!this.loading) {
      this.setStatus('loading');
      this.loading = (async () => {
        const base = new URL(`ffmpeg/${__FFMPEG_CORE_VERSION__}/`, document.baseURI).href;
        if (!this.wasmBlobUrl) this.wasmBlobUrl = await this.fetchWithProgress(base + 'ffmpeg-core.wasm');
        const ff = new FFmpeg();
        ff.on('log', ({ message }) => this.sink?.(message));
        await ff.load({ coreURL: base + 'ffmpeg-core.js', wasmURL: this.wasmBlobUrl });
        this.ff = ff;
        this.setStatus('ready');
        return ff;
      })().catch((err) => {
        this.loading = null;
        this.setStatus('error');
        throw err;
      });
    }
    return this.loading;
  }

  private async fetchWithProgress(url: string): Promise<string> {
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} ${url}`);
    const total = Number(res.headers.get('content-length')) || 32_000_000;
    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let got = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      got += value.length;
      // content-length may be the compressed size, so cap the ratio.
      this.loadProgress = Math.min(0.99, got / total);
      this.statusChanged.emit('loading');
    }
    this.loadProgress = 1;
    return URL.createObjectURL(new Blob(chunks as BlobPart[], { type: 'application/wasm' }));
  }

  /** Jobs are serialized: ffmpeg.wasm can only run one command at a time. */
  run<T>(fn: (ctx: JobContext) => Promise<T>, signal?: AbortSignal): Promise<T> {
    const job = this.chain.then(() => this.runNow(fn, signal));
    this.chain = job.catch(() => undefined);
    return job;
  }

  /** Kills the running command (the worker is restarted on the next job). */
  terminate(): void {
    if (!this.ff) return;
    this.terminated = true;
    this.ff.terminate();
    this.ff = null;
    this.loading = null;
    this.setStatus('idle');
  }

  private async runNow<T>(fn: (ctx: JobContext) => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) throw new CancelledError();
    const ff = await this.load();
    if (signal?.aborted) throw new CancelledError();
    this.terminated = false;
    this.active++;
    this.busyChanged.emit(true);
    const dir = `/job${++this.jobSeq}`;
    const mounts: string[] = [];
    let seq = 0;
    let crashed = false;
    const onAbort = () => this.terminate();
    signal?.addEventListener('abort', onAbort);

    const guard = async <R>(p: Promise<R>): Promise<R> => {
      try {
        return await p;
      } catch (err) {
        if (this.terminated || signal?.aborted) throw new CancelledError();
        throw err;
      }
    };
    /** exec/ffprobe rejecting (rather than returning an exit code) means the wasm heap may be corrupt. */
    const run = async (p: Promise<number>): Promise<number> => {
      try {
        return await guard(p);
      } catch (err) {
        if (err instanceof CancelledError) throw err;
        crashed = true;
        throw new EngineCrashError(err instanceof Error ? err.message : String(err));
      }
    };

    const ctx: JobContext = {
      dir,
      input: async (blob, name) => {
        const ext = (/\.([a-z0-9]{1,8})$/i.exec(name)?.[1] ?? 'bin').toLowerCase();
        const mnt = `${dir}/in${seq++}`;
        const fileName = `input.${ext}`;
        await guard(ff.createDir(mnt));
        await guard(
          ff.mount('WORKERFS' as FFFSType, { files: [new File([blob], fileName, { type: blob.type })] }, mnt),
        );
        mounts.push(mnt);
        return `${mnt}/${fileName}`;
      },
      write: async (name, data) => {
        const path = `${dir}/${name}`;
        await guard(ff.writeFile(path, data));
        return path;
      },
      read: async (path) => {
        const data = await guard(ff.readFile(path));
        if (typeof data === 'string') return new TextEncoder().encode(data);
        return data;
      },
      list: async () => {
        const nodes = await guard(ff.listDir(dir));
        return nodes
          .filter((n) => !n.isDir)
          .map((n) => `${dir}/${n.name}`)
          .sort();
      },
      remove: async (path) => {
        await guard(ff.deleteFile(path));
      },
      exec: async (args, opts = {}) => {
        const log: string[] = [];
        this.sink = (line) => {
          if (log.length < LOG_LIMIT) log.push(line);
          opts.onLog?.(line);
          if (opts.onProgress && opts.duration && opts.duration > 0) {
            const i = line.indexOf('time=');
            if (i >= 0) {
              const tSec = parseClock(line.slice(i + 5, i + 25));
              if (Number.isFinite(tSec)) opts.onProgress(Math.min(1, Math.max(0, tSec / opts.duration)));
            }
          }
        };
        try {
          const code = await run(ff.exec(args));
          if (code !== 0) {
            if (import.meta.env.DEV) console.warn('[ffmpeg]', args.join(' '), '\n', log.join('\n'));
            throw new FFmpegError(summarize(log), log);
          }
          opts.onProgress?.(1);
          return log;
        } finally {
          this.sink = null;
        }
      },
      ffprobe: async (args) => {
        this.sink = null;
        return run(ff.ffprobe(args));
      },
    };

    try {
      await guard(ff.createDir(dir));
      return await fn(ctx);
    } finally {
      signal?.removeEventListener('abort', onAbort);
      if (crashed) this.terminate();
      else if (!this.terminated) await this.cleanup(ff, dir, mounts).catch(() => undefined);
      this.active--;
      this.busyChanged.emit(this.active > 0);
    }
  }

  private async cleanup(ff: FFmpeg, dir: string, mounts: string[]) {
    for (const m of mounts) {
      await ff.unmount(m).catch(() => undefined);
      await ff.deleteDir(m).catch(() => undefined);
    }
    const nodes = await ff.listDir(dir).catch(() => []);
    for (const n of nodes) {
      if (!n.isDir) await ff.deleteFile(`${dir}/${n.name}`).catch(() => undefined);
    }
    await ff.deleteDir(dir).catch(() => undefined);
  }
}

export const engine = new Engine();
