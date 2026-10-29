import type { FormatGroup, MediaKind, Segment } from './engine/formats';
import type { MediaInfo } from './engine/probe';
import { Emitter } from './utils';

/** Crop rectangle normalized to 0..1 of the displayed frame. */
export interface CropRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MediaItem {
  id: string;
  name: string;
  /** The file as the user picked it. */
  file: File;
  /** What ffmpeg reads: the original, or a decoded stand-in (HEIC -> PNG, animated WebP -> PNG/MOV). */
  source: File;
  kind: MediaKind;
  info?: MediaInfo;
  previewUrl?: string;
  /** Preview is a low-res transcode because the browser cannot play the original. */
  proxy: boolean;
  thumb?: string;
  status: 'pending' | 'processing' | 'ready' | 'error';
  stage?: string;
  progress?: number;
  error?: string;
  notes: string[];
  range: Segment;
  crop: CropRect | null;
}

export interface OutputItem {
  id: string;
  name: string;
  blob: Blob;
  url: string;
  group: FormatGroup | 'zip';
  createdAt: number;
}

class Store {
  items: MediaItem[] = [];
  outputs: OutputItem[] = [];
  currentId: string | null = null;

  readonly itemsChanged = new Emitter<void>();
  readonly itemUpdated = new Emitter<MediaItem>();
  readonly currentChanged = new Emitter<MediaItem | null>();
  readonly rangeChanged = new Emitter<MediaItem>();
  readonly cropChanged = new Emitter<MediaItem>();
  readonly outputsChanged = new Emitter<void>();

  get current(): MediaItem | null {
    return this.items.find((i) => i.id === this.currentId) ?? null;
  }

  add(item: MediaItem): void {
    this.items.push(item);
    this.itemsChanged.emit();
  }

  update(item: MediaItem, patch: Partial<MediaItem>): void {
    Object.assign(item, patch);
    this.itemUpdated.emit(item);
    if (item.id === this.currentId && (patch.status || patch.previewUrl)) this.currentChanged.emit(item);
  }

  remove(id: string): void {
    const item = this.items.find((i) => i.id === id);
    if (!item) return;
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    this.items = this.items.filter((i) => i.id !== id);
    if (this.currentId === id) this.select(this.items[0]?.id ?? null);
    this.itemsChanged.emit();
  }

  select(id: string | null): void {
    if (this.currentId === id) return;
    this.currentId = id;
    this.currentChanged.emit(this.current);
  }

  setRange(item: MediaItem, range: Segment): void {
    item.range = range;
    this.rangeChanged.emit(item);
  }

  setCrop(item: MediaItem, crop: CropRect | null): void {
    item.crop = crop;
    this.cropChanged.emit(item);
  }

  addOutput(name: string, blob: Blob, group: OutputItem['group']): OutputItem {
    const out: OutputItem = {
      id: `o${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
      name,
      blob,
      url: URL.createObjectURL(blob),
      group,
      createdAt: Date.now(),
    };
    this.outputs.unshift(out);
    this.outputsChanged.emit();
    return out;
  }

  removeOutput(id: string): void {
    const out = this.outputs.find((o) => o.id === id);
    if (out) URL.revokeObjectURL(out.url);
    this.outputs = this.outputs.filter((o) => o.id !== id);
    this.outputsChanged.emit();
  }

  clearOutputs(): void {
    for (const o of this.outputs) URL.revokeObjectURL(o.url);
    this.outputs = [];
    this.outputsChanged.emit();
  }
}

export const store = new Store();
