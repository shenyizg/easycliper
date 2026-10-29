import { h, type Child } from '../utils';
import { icon } from './icons';

let toastHost: HTMLElement | null = null;

export function toast(message: string, kind: 'info' | 'success' | 'error' = 'info', ms = 3200): void {
  if (!toastHost) {
    toastHost = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(toastHost);
  }
  const el = h('div', { class: `toast toast-${kind}` }, message);
  toastHost.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, ms);
}

/** Opens a modal dialog; returns a close function. */
export function modal(title: Child, body: Child, opts: { wide?: boolean; onClose?: () => void } = {}): () => void {
  const close = () => {
    document.removeEventListener('keydown', onKey);
    backdrop.remove();
    opts.onClose?.();
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  const dialog = h(
    'div',
    { class: `modal${opts.wide ? ' modal-wide' : ''}`, role: 'dialog', 'aria-modal': 'true' },
    h(
      'div',
      { class: 'modal-head' },
      h('h2', null, title),
      h('button', { class: 'icon-btn', onclick: () => close(), i18nTitle: 'common.close' }, icon('x')),
    ),
    h('div', { class: 'modal-body' }, body),
  );
  const backdrop = h('div', {
    class: 'modal-backdrop',
    onclick: (e: MouseEvent) => {
      if (e.target === backdrop) close();
    },
  }, dialog);
  document.body.appendChild(backdrop);
  document.addEventListener('keydown', onKey);
  return close;
}
