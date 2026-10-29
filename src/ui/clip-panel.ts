import { formatDef, groupsFor, targetSize, fitCrop, type Segment } from '../engine/formats';
import { onLangChange, t } from '../i18n';
import { cropPixels, encodeItem } from '../jobs';
import { store, type MediaItem } from '../state';
import { tasks } from '../tasks';
import { baseName, formatTime, h } from '../utils';
import { icon } from './icons';
import { OptionsForm } from './options';
import { toast } from './overlay';

/** Trim + export of the current item. */
export class ClipPanel {
  readonly el: HTMLElement;
  private form = new OptionsForm('mp4');
  private summary: HTMLElement;
  private exportBtn: HTMLButtonElement;
  private sourceId: string | null = null;

  constructor() {
    this.summary = h('div', { class: 'summary' });
    this.exportBtn = h('button', { class: 'btn primary big', onclick: () => this.export() }, icon('scissors'), h('span', { i18n: 'clip.export' }));
    this.el = h(
      'div',
      { class: 'panel-body clip-panel' },
      h('p', { class: 'muted small', i18n: 'clip.intro' }),
      this.form.el,
      h('div', { class: 'actions' }, this.summary, this.exportBtn),
    );
    this.form.changed.on(() => this.render());
    store.currentChanged.on(() => this.onItem());
    store.rangeChanged.on(() => this.render());
    store.cropChanged.on(() => this.render());
    onLangChange.on(() => this.render());
    this.onItem();
  }

  private onItem() {
    const item = store.current;
    if (item?.status === 'ready' && item.id !== this.sourceId) {
      this.sourceId = item.id;
      this.form.setAllowed(groupsFor(item.kind, !!item.info?.audio));
      this.form.setSource(item.info);
    }
    this.render();
  }

  private segmentOf(item: MediaItem): Segment | undefined {
    if (item.kind === 'image') return undefined;
    const { start, end } = item.range;
    const full = start <= 1e-6 && end >= (item.info?.duration ?? 0) - 1e-3;
    return full ? undefined : item.range;
  }

  private render() {
    const item = store.current;
    const ready = item?.status === 'ready' && !!item.info;
    this.exportBtn.disabled = !ready;
    this.summary.replaceChildren();
    if (!ready) {
      this.summary.append(h('span', { class: 'muted', i18n: 'clip.noItem' }));
      return;
    }
    const o = this.form.opts;
    const def = formatDef(o.format);
    const parts: string[] = [];
    if (item.kind !== 'image') {
      const r = item.range;
      parts.push(`${formatTime(r.start)} → ${formatTime(r.end)}`);
      const len = (r.end - r.start) / (o.copy ? 1 : o.speed);
      parts.push(t('clip.duration', { d: formatTime(len) }));
    }
    const v = item.info!.video;
    if (v && def.group !== 'audio') {
      if (o.copy && def.copy) parts.push(`${v.displayWidth}×${v.displayHeight}`);
      else {
        let w = v.displayWidth;
        let hh = v.displayHeight;
        const c = cropPixels(item);
        if (c) ({ w, h: hh } = fitCrop(c, w, hh, !!def.even));
        const [W, H] = targetSize(w, hh, o, !!def.even);
        parts.push(`${W}×${H}`);
        if (def.group !== 'image') parts.push(`${o.fps || +v.fps.toFixed(2)} fps`);
      }
    }
    this.summary.append(h('span', { class: 'mono' }, parts.join(' · ')));
    if (item.crop && o.copy && def.copy) this.summary.append(h('span', { class: 'warn small', i18n: 'clip.copyNoCrop' }));
    else if (item.crop) this.summary.append(h('span', { class: 'chip', i18n: 'clip.cropOn' }));
  }

  private export() {
    const item = store.current;
    if (!item || item.status !== 'ready' || !item.info) return;
    const opts = { ...this.form.opts };
    const def = formatDef(opts.format);
    const segment = this.segmentOf(item);
    const crop = opts.copy && def.copy ? undefined : cropPixels(item);
    const tag = segment ? `_${segment.start.toFixed(2)}-${segment.end.toFixed(2)}s` : item.kind === 'image' ? '' : '_full';
    let name = `${baseName(item.name)}${tag}.${def.ext}`;
    if (name === item.name) name = `${baseName(item.name)}_out.${def.ext}`;
    void tasks
      .run(t('task.export', { name }), (api) =>
        encodeItem(item, opts, { segment, crop }, api.signal, (r) => api.progress(r)),
      )
      .then((blob) => {
        if (!blob) return;
        store.addOutput(name, blob, def.group);
        toast(t('toast.exported', { name }), 'success');
      });
  }
}
