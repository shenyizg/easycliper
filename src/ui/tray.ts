import { onLangChange, t } from '../i18n';
import { tasks } from '../tasks';
import { h } from '../utils';
import { icon } from './icons';

/** Floating list of queued / running tasks with progress and cancel. */
export class TaskTray {
  readonly el: HTMLElement;

  constructor() {
    this.el = h('div', { class: 'tray', 'aria-live': 'polite' });
    let pending = false;
    // progress events can be very frequent: coalesce renders per frame
    const schedule = () => {
      if (pending) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        this.render();
      });
    };
    tasks.changed.on(schedule);
    onLangChange.on(schedule);
  }

  private render() {
    const all = tasks.tasks;
    this.el.hidden = all.length === 0;
    // keep the tray small: everything that is not merely waiting, plus the next few queued
    const queued = all.filter((x) => x.status === 'queued');
    const list = [...all.filter((x) => x.status !== 'queued'), ...queued.slice(0, 2)];
    const hiddenQueued = queued.length - Math.min(2, queued.length);
    this.el.replaceChildren(
      ...list.map((task) => {
        const pct = task.progress != null ? Math.round(task.progress * 100) : null;
        const busy = task.status === 'running' || task.status === 'queued';
        const state =
          task.status === 'queued'
            ? t('tray.queued')
            : task.status === 'running'
              ? `${task.detail ? task.detail + ' ' : ''}${pct != null ? pct + '%' : ''}`
              : task.status === 'done'
                ? t('tray.done')
                : task.error ?? '';
        return h(
          'div',
          { class: `tray-item ${task.status}` },
          h(
            'div',
            { class: 'tray-row' },
            h('span', { class: 'tray-label', title: task.label }, task.label),
            busy
              ? h('button', { class: 'icon-btn small', i18nTitle: 'tray.cancel', onclick: () => tasks.cancel(task.id) }, icon('x', 14))
              : task.status === 'error'
                ? h('button', { class: 'icon-btn small', i18nTitle: 'tray.dismiss', onclick: () => tasks.dismiss(task.id) }, icon('x', 14))
                : null,
          ),
          task.status === 'running'
            ? h('div', { class: `bar${pct == null ? ' indeterminate' : ''}` }, h('i', { style: { width: `${pct ?? 30}%` } }))
            : null,
          h('div', { class: 'tray-state small' }, state),
        );
      }),
    );
    if (hiddenQueued > 0) this.el.append(h('div', { class: 'tray-more small muted' }, t('tray.more', { n: hiddenQueued })));
  }
}
