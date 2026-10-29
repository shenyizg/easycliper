import { CancelledError, EngineCrashError, FFmpegError } from './engine/ffmpeg';
import { BuildError } from './engine/formats';
import { has, t } from './i18n';
import { Emitter, errorMessage, uid } from './utils';

export type TaskStatus = 'queued' | 'running' | 'done' | 'error' | 'cancelled';

export interface Task {
  id: string;
  label: string;
  status: TaskStatus;
  progress: number | null;
  detail: string;
  error?: string;
  controller: AbortController;
  quiet: boolean;
}

export interface TaskApi {
  signal: AbortSignal;
  /** ratio 0..1, or null for indeterminate */
  progress(ratio: number | null, detail?: string): void;
}

/** Human readable message for errors thrown anywhere in the pipeline. */
export function describeError(err: unknown): string {
  if (err instanceof CancelledError) return t('task.cancelled');
  if (err instanceof BuildError) return t(`err.${err.code}`);
  if (err instanceof FFmpegError) return `FFmpeg: ${err.message}`;
  if (err instanceof EngineCrashError) return t('err.crash', { detail: err.detail });
  const msg = errorMessage(err);
  return has(`err.${msg}`) ? t(`err.${msg}`) : msg;
}

/**
 * Runs user-visible tasks one at a time (ffmpeg.wasm is single-instance anyway),
 * so the tray shows an honest queue.
 */
class TaskManager {
  tasks: Task[] = [];
  readonly changed = new Emitter<void>();
  private chain: Promise<unknown> = Promise.resolve();

  get active(): boolean {
    return this.tasks.some((x) => x.status === 'queued' || x.status === 'running');
  }

  run<T>(
    label: string,
    fn: (api: TaskApi) => Promise<T>,
    opts: { quiet?: boolean; signal?: AbortSignal } = {},
  ): Promise<T | undefined> {
    const task: Task = {
      id: uid('t'),
      label,
      status: 'queued',
      progress: null,
      detail: '',
      controller: new AbortController(),
      quiet: !!opts.quiet,
    };
    this.tasks.push(task);
    this.changed.emit();
    opts.signal?.addEventListener('abort', () => this.cancel(task.id), { once: true });

    const api: TaskApi = {
      signal: task.controller.signal,
      progress: (ratio, detail) => {
        task.progress = ratio;
        if (detail !== undefined) task.detail = detail;
        this.changed.emit();
      },
    };

    const result = this.chain.then(async () => {
      if (task.controller.signal.aborted) throw new CancelledError();
      task.status = 'running';
      this.changed.emit();
      return fn(api);
    });
    this.chain = result.catch(() => undefined);

    return result.then(
      (value) => {
        task.status = 'done';
        task.progress = 1;
        if (task.quiet) this.dismiss(task.id);
        else this.finish(task, 1200);
        return value;
      },
      (err: unknown) => {
        const cancelled = err instanceof CancelledError || task.controller.signal.aborted;
        task.status = cancelled ? 'cancelled' : 'error';
        task.error = describeError(err);
        if (!cancelled) console.error(err);
        this.finish(task, cancelled || task.quiet ? 1500 : 0);
        return undefined;
      },
    );
  }

  cancel(id: string): void {
    const task = this.tasks.find((x) => x.id === id);
    if (!task) return;
    task.controller.abort();
    if (task.status === 'queued') {
      task.status = 'cancelled';
      this.finish(task, 600);
    }
  }

  dismiss(id: string): void {
    this.tasks = this.tasks.filter((x) => x.id !== id);
    this.changed.emit();
  }

  /** keepMs 0 = keep until dismissed */
  private finish(task: Task, keepMs: number) {
    this.changed.emit();
    if (keepMs > 0) setTimeout(() => this.dismiss(task.id), keepMs);
  }
}

export const tasks = new TaskManager();
