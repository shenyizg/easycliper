import type { Segment } from '../engine/formats';
import { t } from '../i18n';
import { cropPixels, snapshotFrame } from '../jobs';
import { store, type CropRect, type MediaItem } from '../state';
import { tasks } from '../tasks';
import { baseName, clamp, Emitter, formatTime, h, parseTime, select } from '../utils';
import { CropOverlay } from './crop';
import { icon } from './icons';
import { toast } from './overlay';
import { Timeline } from './timeline';

const ASPECTS = [
  { value: 'free', label: 'crop.free' },
  { value: 'orig', label: 'crop.original' },
  { value: '1', label: '1:1', raw: true },
  { value: '4/3', label: '4:3', raw: true },
  { value: '3/4', label: '3:4', raw: true },
  { value: '16/9', label: '16:9', raw: true },
  { value: '9/16', label: '9:16', raw: true },
];

const RATES = [0.25, 0.5, 1, 1.5, 2].map((r) => ({ value: r, label: `${r}×`, raw: true }));

export class Player {
  readonly el: HTMLElement;
  readonly timeChanged = new Emitter<number>();
  /** Called by the empty-state button. */
  onImport: () => void = () => {};

  private stage: HTMLElement;
  private video: HTMLVideoElement;
  private img: HTMLImageElement;
  private placeholder: HTMLElement;
  private audioBadge: HTMLElement;
  private crop = new CropOverlay();
  private timeline = new Timeline();
  private meta: HTMLElement;
  private transport: HTMLElement;
  private rangeRow: HTMLElement;
  private playBtn: HTMLButtonElement;
  private timeLabel: HTMLElement;
  private frameLabel: HTMLElement;
  private inInput: HTMLInputElement;
  private outInput: HTMLInputElement;
  private lenLabel: HTMLElement;
  private cropBtn: HTMLButtonElement;
  private aspectSel: HTMLSelectElement;
  private loopBtn: HTMLButtonElement;
  private snapBtn: HTMLButtonElement;
  private item: MediaItem | null = null;
  private loop = true;
  private aspect = 'free';
  private raf = 0;

  constructor() {
    this.video = h('video', { class: 'media', playsInline: true, preload: 'auto' });
    this.img = h('img', { class: 'media', alt: '', draggable: false });
    this.placeholder = h('div', { class: 'stage-placeholder' });
    this.audioBadge = h('div', { class: 'audio-badge' }, icon('music', 56));
    this.stage = h('div', { class: 'stage' }, this.video, this.img, this.audioBadge, this.crop.el, this.placeholder);

    this.meta = h('div', { class: 'player-meta' });

    this.playBtn = h('button', { class: 'icon-btn primary', onclick: () => this.togglePlay(), i18nTitle: 'player.play' }, icon('play', 20));
    this.timeLabel = h('span', { class: 'mono time' }, '00:00.000 / 00:00.000');
    this.frameLabel = h('span', { class: 'mono frame' });
    this.loopBtn = h('button', { class: 'icon-btn toggle on', onclick: () => this.toggleLoop(), i18nTitle: 'player.loop' }, icon('repeat'));
    this.snapBtn = h('button', { class: 'btn', onclick: () => void this.snapshot(), i18nTitle: 'player.snapshotHint' }, icon('camera'), h('span', { i18n: 'player.snapshot' }));
    const rateSel = select(RATES, 1, (r) => (this.video.playbackRate = r));
    rateSel.classList.add('compact');
    rateSel.dataset.i18nTitle = 'player.rate';
    rateSel.title = t('player.rate');

    this.transport = h(
      'div',
      { class: 'transport' },
      h('button', { class: 'icon-btn', onclick: () => this.step(-1), i18nTitle: 'player.prevFrame' }, icon('stepBack')),
      this.playBtn,
      h('button', { class: 'icon-btn', onclick: () => this.step(1), i18nTitle: 'player.nextFrame' }, icon('stepFwd')),
      this.timeLabel,
      this.frameLabel,
      h('span', { class: 'spacer' }),
      rateSel,
      this.loopBtn,
      this.snapBtn,
    );

    this.inInput = h('input', { class: 'mono time-input', type: 'text', spellcheck: false, 'aria-label': 'in' });
    this.outInput = h('input', { class: 'mono time-input', type: 'text', spellcheck: false, 'aria-label': 'out' });
    this.inInput.addEventListener('change', () => this.commitInput('start'));
    this.outInput.addEventListener('change', () => this.commitInput('end'));
    this.lenLabel = h('span', { class: 'muted mono len' });
    this.cropBtn = h('button', { class: 'btn toggle', onclick: () => this.toggleCrop(), i18nTitle: 'crop.hint' }, icon('crop'), h('span', { i18n: 'crop.toggle' }));
    this.aspectSel = select(ASPECTS, 'free', (a) => this.setAspect(a));
    this.aspectSel.classList.add('compact');

    this.rangeRow = h(
      'div',
      { class: 'range-row' },
      h('div', { class: 'range-group timed' },
        h('button', { class: 'btn', onclick: () => this.markIn(), i18nTitle: 'player.setInHint' }, h('span', { i18n: 'player.setIn' })),
        this.inInput,
        h('span', { class: 'muted' }, '→'),
        this.outInput,
        h('button', { class: 'btn', onclick: () => this.markOut(), i18nTitle: 'player.setOutHint' }, h('span', { i18n: 'player.setOut' })),
        h('button', { class: 'icon-btn', onclick: () => this.resetRange(), i18nTitle: 'player.resetRange' }, icon('reset')),
        this.lenLabel,
      ),
      h('span', { class: 'spacer' }),
      h('div', { class: 'range-group' }, this.cropBtn, this.aspectSel),
    );

    this.el = h('section', { class: 'player panel' }, this.meta, this.stage, this.timeline.el, this.transport, this.rangeRow);

    this.wireVideo();
    this.timeline.snap = (x) => this.snap(x);
    this.timeline.onSeek = (x) => this.seek(x);
    this.timeline.onRange = (r, edge) => this.applyRange(r, edge);
    this.crop.onChange = (r: CropRect) => this.item && store.setCrop(this.item, r);
    new ResizeObserver(() => this.layoutCrop()).observe(this.stage);
    this.img.addEventListener('load', () => this.layoutCrop());

    store.currentChanged.on((item) => this.load(item));
    store.itemUpdated.on((item) => {
      if (item === this.item && item.status !== 'ready') this.renderPlaceholder();
    });
    store.rangeChanged.on((item) => item === this.item && this.renderRange());
    store.cropChanged.on((item) => item === this.item && this.renderCrop());
    this.load(null);
  }

  // ---- state helpers -------------------------------------------------------

  private get fps(): number {
    if (this.item?.kind === 'audio') return 100;
    return this.item?.info?.video?.fps || 30;
  }

  private get duration(): number {
    const d = this.item?.info?.duration ?? 0;
    if (d > 0) return d;
    return Number.isFinite(this.video.duration) ? this.video.duration : 0;
  }

  private get timed(): boolean {
    return !!this.item && this.item.kind !== 'image';
  }

  private frameOf(time: number): number {
    return Math.max(0, Math.floor(time * this.fps + 1e-3));
  }

  private get lastFrame(): number {
    return Math.max(0, Math.ceil(this.duration * this.fps - 1e-3) - 1);
  }

  private snap(time: number): number {
    return clamp(Math.round(time * this.fps) / this.fps, 0, this.duration);
  }

  get currentTime(): number {
    return this.video.currentTime;
  }

  // ---- loading -------------------------------------------------------------

  private load(item: MediaItem | null) {
    this.item = item;
    this.pause();
    cancelAnimationFrame(this.raf);
    const ready = !!item && item.status === 'ready' && !!item.previewUrl;
    this.el.classList.toggle('is-empty', !ready);
    this.el.classList.toggle('is-image', ready && item!.kind === 'image');
    this.el.classList.toggle('is-audio', ready && item!.kind === 'audio');
    this.renderMeta();

    if (!ready) {
      this.video.removeAttribute('src');
      this.video.load();
      this.img.removeAttribute('src');
      this.timeline.setDuration(0);
      this.timeline.loadStrip('', undefined, 0);
      this.renderPlaceholder();
      this.renderCrop();
      return;
    }
    this.placeholder.replaceChildren();
    if (item.kind === 'image') {
      this.video.removeAttribute('src');
      this.video.load();
      this.img.src = item.previewUrl!;
    } else {
      this.img.removeAttribute('src');
      if (this.video.src !== item.previewUrl) this.video.src = item.previewUrl!;
      this.timeline.setDuration(this.duration);
      this.timeline.loadStrip(item.id, item.kind === 'audio' ? undefined : item.previewUrl, this.duration);
    }
    this.snapBtn.hidden = item.kind === 'image' || item.kind === 'audio';
    this.cropBtn.disabled = item.kind === 'audio';
    this.renderRange();
    this.renderCrop();
    this.updateTime();
  }

  private renderMeta() {
    const item = this.item;
    this.meta.replaceChildren();
    if (!item) return;
    const info = item.info;
    const bits: string[] = [];
    if (info?.video) {
      bits.push(`${info.video.displayWidth}×${info.video.displayHeight}`);
      if (item.kind !== 'image') bits.push(`${+info.video.fps.toFixed(2)} fps`);
      bits.push(info.video.codec);
    }
    if (info?.audio) bits.push(`${info.audio.codec} ${info.audio.sampleRate ? Math.round(info.audio.sampleRate / 1000) + 'kHz' : ''}`.trim());
    if (info && item.kind !== 'image') bits.push(formatTime(info.duration));
    this.meta.append(
      h('strong', { class: 'name', title: item.name }, item.name),
      h('span', { class: 'muted' }, bits.join(' · ')),
      ...item.notes.map((n) => h('span', { class: 'chip', i18n: n })),
    );
  }

  private renderPlaceholder() {
    const item = this.item;
    this.placeholder.replaceChildren();
    if (!item) {
      this.placeholder.append(
        icon('film', 48),
        h('p', { i18n: 'player.empty' }),
        h('button', { class: 'btn primary', onclick: () => this.onImport() }, icon('upload'), h('span', { i18n: 'library.import' })),
        h('p', { class: 'muted small', i18n: 'player.privacy' }),
      );
    } else if (item.status === 'error') {
      this.placeholder.append(icon('x', 40), h('p', null, item.error ?? ''));
    } else {
      const pct = item.progress != null ? ` ${Math.round(item.progress * 100)}%` : '';
      this.placeholder.append(
        h('div', { class: 'spinner' }),
        h('p', null, `${item.stage ? t(item.stage) : t('stage.analyzing')}${pct}`),
      );
    }
  }

  private renderRange() {
    const item = this.item;
    if (!item || !this.timed) return;
    const r = item.range;
    this.timeline.setRange(r);
    this.inInput.value = formatTime(r.start);
    this.outInput.value = formatTime(r.end);
    const frames = item.kind === 'audio' ? '' : ` · ${t('player.frames', { n: Math.max(1, Math.round((r.end - r.start) * this.fps)) })}`;
    this.lenLabel.textContent = `${t('player.length')} ${formatTime(r.end - r.start)}${frames}`;
  }

  private renderCrop() {
    const item = this.item;
    const on = !!item?.crop && item.status === 'ready';
    this.crop.el.hidden = !on;
    this.cropBtn.classList.toggle('on', on);
    this.aspectSel.disabled = !on;
    const v = item?.info?.video;
    if (v) this.crop.setFrame(v.displayWidth, v.displayHeight);
    if (on) {
      this.crop.setRect(item!.crop!);
      this.layoutCrop();
    }
  }

  private layoutCrop() {
    const item = this.item;
    if (!item || this.crop.el.hidden) return;
    const isImg = item.kind === 'image';
    const mw = isImg ? this.img.naturalWidth : this.video.videoWidth;
    const mh = isImg ? this.img.naturalHeight : this.video.videoHeight;
    if (!mw || !mh) return;
    const sw = this.stage.clientWidth;
    const sh = this.stage.clientHeight;
    const s = Math.min(sw / mw, sh / mh);
    const w = mw * s;
    const hh = mh * s;
    this.crop.place((sw - w) / 2, (sh - hh) / 2, w, hh);
  }

  // ---- playback ------------------------------------------------------------

  private wireVideo() {
    const v = this.video;
    v.addEventListener('loadedmetadata', () => {
      const item = this.item;
      if (item?.info && !(item.info.duration > 0) && Number.isFinite(v.duration)) {
        item.info.duration = v.duration;
        store.setRange(item, { start: 0, end: v.duration });
        this.timeline.setDuration(v.duration);
      }
      if (item) v.currentTime = item.range.start + 0.5 / this.fps;
      this.layoutCrop();
    });
    v.addEventListener('play', () => {
      this.playBtn.replaceChildren(icon('pause', 20));
      const tick = () => {
        this.onTick();
        if (!v.paused) this.raf = requestAnimationFrame(tick);
      };
      this.raf = requestAnimationFrame(tick);
    });
    v.addEventListener('pause', () => {
      this.playBtn.replaceChildren(icon('play', 20));
      cancelAnimationFrame(this.raf);
      this.updateTime();
    });
    v.addEventListener('ended', () => {
      if (this.loop && this.item) {
        v.currentTime = this.item.range.start;
        void v.play();
      }
    });
    v.addEventListener('seeked', () => this.updateTime());
    v.addEventListener('timeupdate', () => v.paused && this.updateTime());
  }

  private onTick() {
    const item = this.item;
    const v = this.video;
    if (item && !v.paused && v.currentTime >= item.range.end - 1e-3) {
      if (this.loop) v.currentTime = item.range.start;
      else {
        v.pause();
        v.currentTime = Math.max(item.range.start, item.range.end - 0.5 / this.fps);
      }
    }
    this.updateTime();
  }

  private updateTime() {
    const time = this.video.currentTime || 0;
    this.timeline.setTime(time);
    const shown = this.video.paused && this.item?.kind !== 'audio' ? this.frameOf(time) / this.fps : time;
    this.timeLabel.textContent = `${formatTime(shown)} / ${formatTime(this.duration)}`;
    this.frameLabel.textContent =
      this.item && this.item.kind !== 'audio' && this.timed ? t('player.frameNo', { n: this.frameOf(time), total: this.lastFrame + 1 }) : '';
    this.timeChanged.emit(time);
  }

  togglePlay(): void {
    if (!this.timed) return;
    const v = this.video;
    if (!v.paused) {
      v.pause();
      return;
    }
    const r = this.item!.range;
    if (v.currentTime < r.start - 1e-3 || v.currentTime >= r.end - 1e-3) v.currentTime = r.start;
    void v.play().catch(() => undefined);
  }

  pause(): void {
    if (!this.video.paused) this.video.pause();
  }

  seek(time: number): void {
    if (!this.timed) return;
    this.video.currentTime = clamp(time, 0, this.duration);
    this.updateTime();
  }

  /** Shows frame `n` (seeks to the middle of the frame so the decoder lands on it). */
  seekFrame(n: number): void {
    const f = clamp(n, 0, this.lastFrame);
    this.seek(Math.min(this.duration, (f + 0.5) / this.fps));
  }

  step(delta: number): void {
    if (!this.timed) return;
    this.pause();
    this.seekFrame(this.frameOf(this.video.currentTime) + delta);
  }

  private toggleLoop() {
    this.loop = !this.loop;
    this.loopBtn.classList.toggle('on', this.loop);
  }

  // ---- range ---------------------------------------------------------------

  private applyRange(r: Segment, edge: 'start' | 'end') {
    const item = this.item;
    if (!item) return;
    const minLen = 1 / this.fps;
    const d = this.duration;
    let start = clamp(r.start, 0, d);
    let end = clamp(r.end, 0, d);
    if (end - start < minLen) {
      if (edge === 'start') start = Math.max(0, end - minLen);
      else end = Math.min(d, start + minLen);
    }
    store.setRange(item, { start, end });
    this.pause();
    this.seek(edge === 'start' ? start + 0.5 / this.fps : Math.max(start, end - 0.5 / this.fps));
  }

  markIn(): void {
    if (!this.timed) return;
    this.applyRange({ start: this.frameOf(this.video.currentTime) / this.fps, end: this.item!.range.end }, 'start');
  }

  markOut(): void {
    if (!this.timed) return;
    this.applyRange({ start: this.item!.range.start, end: (this.frameOf(this.video.currentTime) + 1) / this.fps }, 'end');
  }

  private resetRange() {
    if (!this.item) return;
    store.setRange(this.item, { start: 0, end: this.duration });
  }

  private commitInput(edge: 'start' | 'end') {
    const item = this.item;
    if (!item) return;
    const input = edge === 'start' ? this.inInput : this.outInput;
    const v = parseTime(input.value);
    if (!Number.isFinite(v)) {
      this.renderRange();
      return;
    }
    const s = this.snap(v);
    this.applyRange(edge === 'start' ? { start: s, end: item.range.end } : { start: item.range.start, end: s }, edge);
  }

  goToEdge(edge: 'start' | 'end'): void {
    const r = this.item?.range;
    if (!r) return;
    this.pause();
    this.seek(edge === 'start' ? r.start + 0.5 / this.fps : Math.max(r.start, r.end - 0.5 / this.fps));
  }

  // ---- crop ----------------------------------------------------------------

  private toggleCrop() {
    const item = this.item;
    if (!item || item.status !== 'ready' || item.kind === 'audio') return;
    if (item.crop) {
      store.setCrop(item, null);
      return;
    }
    store.setCrop(item, { x: 0.1, y: 0.1, w: 0.8, h: 0.8 });
    this.setAspect(this.aspect);
  }

  private setAspect(value: string) {
    this.aspect = value;
    const v = this.item?.info?.video;
    let a = 0;
    if (value === 'orig' && v) a = v.displayWidth / v.displayHeight;
    else if (value !== 'free') {
      const [x, y] = value.split('/').map(Number);
      a = y ? x / y : x;
    }
    this.crop.setAspect(a);
  }

  // ---- snapshot ------------------------------------------------------------

  async snapshot(): Promise<void> {
    const item = this.item;
    if (!item?.info?.video || !this.timed || item.kind === 'audio') return;
    this.pause();
    const n = this.frameOf(this.video.currentTime);
    const name = `${baseName(item.name)}_frame${n}.png`;
    if (!item.proxy) {
      // The browser decodes the original: grab the frame straight from the <video>.
      const v = this.video;
      const c = item.crop ?? { x: 0, y: 0, w: 1, h: 1 };
      const sx = Math.round(c.x * v.videoWidth);
      const sy = Math.round(c.y * v.videoHeight);
      const sw = Math.max(1, Math.round(c.w * v.videoWidth));
      const sh = Math.max(1, Math.round(c.h * v.videoHeight));
      const canvas = h('canvas', { width: sw, height: sh });
      canvas.getContext('2d')!.drawImage(v, sx, sy, sw, sh, 0, 0, sw, sh);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/png'));
      if (blob) {
        store.addOutput(name, blob, 'image');
        toast(t('toast.snapshot'), 'success');
      }
      return;
    }
    const blob = await tasks.run(t('task.snapshot', { n }), (api) =>
      snapshotFrame(item, n / this.fps, cropPixels(item), api.signal),
    );
    if (blob) {
      store.addOutput(name, blob, 'image');
      toast(t('toast.snapshot'), 'success');
    }
  }

  // ---- keyboard ------------------------------------------------------------

  handleKey(e: KeyboardEvent): boolean {
    if (!this.timed) return false;
    switch (e.key) {
      case ' ':
      case 'k':
        this.togglePlay();
        return true;
      case 'ArrowLeft':
        if (e.shiftKey) this.seek(this.video.currentTime - 1);
        else this.step(-1);
        return true;
      case 'ArrowRight':
        if (e.shiftKey) this.seek(this.video.currentTime + 1);
        else this.step(1);
        return true;
      case 'i':
      case 'I':
        this.markIn();
        return true;
      case 'o':
      case 'O':
        this.markOut();
        return true;
      case 'Home':
        this.goToEdge('start');
        return true;
      case 'End':
        this.goToEdge('end');
        return true;
      case 's':
      case 'S':
        void this.snapshot();
        return true;
    }
    return false;
  }
}
