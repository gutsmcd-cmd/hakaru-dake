export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, unknown> = {},
  ...kids: (Node | string | null | undefined | false)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'style') el.setAttribute('style', String(v));
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k === 'value' || k === 'checked') (el as unknown as Record<string, unknown>)[k] = v;
    else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of kids) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

let toastEl: HTMLDivElement | null = null;
let toastTimer = 0;
export function toast(msg: string, action?: { label: string; run: () => void }, ms = 3200): void {
  if (!toastEl) {
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    document.body.append(toastEl);
  }
  const t = toastEl;
  t.replaceChildren(h('span', {}, msg));
  if (action) {
    t.append(
      h('button', {
        type: 'button',
        onclick: () => {
          action.run();
          t.classList.remove('show');
        },
      }, action.label),
    );
  }
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.remove('show'), action ? Math.max(ms, 5000) : ms);
}

export function confirmDialog(title: string, body: string, ok: string, cancel: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => {
    const dlg = h('dialog', {},
      h('h2', {}, title),
      body ? h('p', { class: 'muted', style: 'margin:0' }, body) : null,
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => dlg.close('no') }, cancel),
        h('button', { class: 'btn primary' + (danger ? ' danger-bg' : ''), type: 'button', onclick: () => dlg.close('yes') }, ok),
      ),
    );
    dlg.addEventListener('close', () => {
      resolve(dlg.returnValue === 'yes');
      dlg.remove();
    });
    document.body.append(dlg);
    dlg.showModal();
  });
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

export function uid(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function langToggle(lang: 'ja' | 'en', set: (l: 'ja' | 'en') => void): HTMLElement {
  return h('div', { class: 'lang-toggle', role: 'group', 'aria-label': 'Language' },
    h('button', { type: 'button', 'aria-pressed': String(lang === 'ja'), onclick: () => set('ja') }, '日本語'),
    h('button', { type: 'button', 'aria-pressed': String(lang === 'en'), onclick: () => set('en') }, 'EN'),
  );
}

export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

let banner: HTMLElement | null = null;
/** Bilingual, sticky. Never clears the form — callers keep typed text in memory. */
export function showSaveBanner(): void {
  if (banner?.isConnected) return;
  banner = h('div', { class: 'save-banner', role: 'alert' },
    '保存できませんでした。入力した内容はこの画面に残しています。再読み込みすると消えることがあります。 / Could not save. What you typed is still on this screen. Reloading may discard it.',
  );
  document.body.prepend(banner);
}
export function hideSaveBanner(): void {
  banner?.remove();
  banner = null;
}
