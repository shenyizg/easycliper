import { formatDef, groupsFor } from '../engine/formats';
import { onLangChange, t } from '../i18n';
import { cropPixels, encodeItem } from '../jobs';
import { store, type MediaItem } from '../state';
import { tasks } from '../tasks';
import { baseName, extName, formatBytes, h } from '../utils';
import { icon } from './icons';
import { OptionsForm } from './options';
import { toast } from './overlay';

/** Batch conversion of whole files. */
export class ConvertPanel {
  readonly el: HTMLElement;
  private form = new OptionsForm('mp4');
  private list: HTMLElement;
  private checked = new Set<string>();
  private known = new Set<string>();
  private applyEdits = false;
  private runBtn: HTMLButtonElement;

  constructor() {
    this.list = h('div', { class: 'convert-list' });
    const apply = h('input', { type: 'checkbox' });
    apply.addEventListener('change', () => (this.applyEdits = apply.checked));
    this.runBtn = h('button', { class: 'btn primary big', onclick: () => this.run() }, icon('convert'), h('span', { i18n: 'convert.run' }));
    this.el = h(
      'div',
      { class: 'panel-body convert-panel' },
      h('p', { class: 'muted small', i18n: 'convert.intro' }),
      h('div', { class: 'convert-head' },
        h('strong', { i18n: 'convert.files' }),
        h('span', { class: 'spacer' }),
        h('button', { class: 'btn small', i18n: 'frames.selectAll', onclick: () => this.checkAll(true) }),
        h('button', { class: 'btn small', i18n: 'frames.selectNone', onclick: () => this.checkAll(false) }),
      ),
      this.list,
      this.form.el,
      h('label', { class: 'field check' }, apply, h('span', { i18n: 'convert.applyEdits' })),
      h('div', { class: 'actions' }, h('span', { class: 'spacer' }), this.runBtn),
    );
    this.form.changed.on(() => this.renderList());
    store.itemsChanged.on(() => this.renderList());
    store.itemUpdated.on(() => this.renderList());
    onLangChange.on(() => this.renderList());
    this.renderList();
  }

  private compatible(item: MediaItem): boolean {
    if (item.status !== 'ready') return false;
    return groupsFor(item.kind, !!item.info?.audio).includes(formatDef(this.form.opts.format).group);
  }

  private renderList() {
    // newly imported files start checked
    for (const item of store.items) {
      if (!this.known.has(item.id)) {
        this.known.add(item.id);
        this.checked.add(item.id);
      }
    }
    this.list.replaceChildren();
    if (!store.items.length) {
      this.list.append(h('p', { class: 'muted small', i18n: 'convert.empty' }));
      this.runBtn.disabled = true;
      return;
    }
    let runnable = 0;
    for (const item of store.items) {
      const ok = this.compatible(item);
      const box = h('input', { type: 'checkbox', checked: this.checked.has(item.id), disabled: !ok });
      box.addEventListener('change', () => {
        if (box.checked) this.checked.add(item.id);
        else this.checked.delete(item.id);
        this.renderList();
      });
      if (ok && this.checked.has(item.id)) runnable++;
      const status =
        item.status !== 'ready'
          ? t(item.status === 'error' ? 'library.failed' : 'library.processing')
          : ok
            ? formatBytes(item.file.size)
            : t('convert.incompatible');
      this.list.append(
        h('label', { class: `convert-row${ok ? '' : ' off'}` }, box, h('span', { class: 'name', title: item.name }, item.name), h('span', { class: 'muted small' }, status)),
      );
    }
    this.runBtn.disabled = runnable === 0;
  }

  private checkAll(on: boolean) {
    for (const item of store.items) {
      if (on) this.checked.add(item.id);
      else this.checked.delete(item.id);
    }
    this.renderList();
  }

  private run() {
    const opts = { ...this.form.opts };
    const def = formatDef(opts.format);
    const targets = store.items.filter((i) => this.checked.has(i.id) && this.compatible(i));
    if (!targets.length) return;
    for (const item of targets) {
      const base = baseName(item.name);
      // anim.gif + anim.webp -> anim_gif.mp4 / anim_webp.mp4 instead of two anim.mp4
      const clash = store.items.some((o) => o !== item && baseName(o.name).toLowerCase() === base.toLowerCase());
      let name = clash ? `${base}_${extName(item.name)}.${def.ext}` : `${base}.${def.ext}`;
      if (name.toLowerCase() === item.name.toLowerCase()) name = `${base}_converted.${def.ext}`;
      const segment = this.applyEdits && item.kind !== 'image' ? { ...item.range } : undefined;
      const crop = this.applyEdits && !(opts.copy && def.copy) ? cropPixels(item) : undefined;
      void tasks
        .run(t('task.convert', { name }), (api) => encodeItem(item, opts, { segment, crop }, api.signal, (r) => api.progress(r)))
        .then((blob) => {
          if (!blob) return;
          store.addOutput(name, blob, def.group);
          toast(t('toast.exported', { name }), 'success');
        });
    }
  }
}
