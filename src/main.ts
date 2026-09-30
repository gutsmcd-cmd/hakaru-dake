import './base.css';
import './style.css';
import { h, toast, copyText, uid, langToggle, confirmDialog, showSaveBanner, hideSaveBanner } from './ui';
import { dicts, type Lang, type Dict } from './i18n';
import { askPersist, idbLoad, idbSave, idbPutNow } from './db';

const DB = 'hakaru-dake';

interface Segment { start: number; end: number }
interface Task {
  id: string;
  name: string;
  segments: Segment[];
  runningSince: number | null;
}
interface State { lang: Lang; tasks: Task[] }

let state: State = { lang: 'ja', tasks: [] };
let t: Dict = dicts.ja;
let draft = '';
const app = document.getElementById('app')!;

function isLang(v: unknown): v is Lang {
  return v === 'ja' || v === 'en';
}
function normalize(raw: unknown): State {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const tasks: Task[] = [];
  if (Array.isArray(o.tasks)) {
    for (const item of o.tasks) {
      if (!item || typeof item !== 'object') continue;
      const r = item as Record<string, unknown>;
      if (typeof r.id !== 'string') continue;
      const segments: Segment[] = [];
      if (Array.isArray(r.segments)) {
        for (const s of r.segments) {
          if (!s || typeof s !== 'object') continue;
          const sg = s as Record<string, unknown>;
          if (typeof sg.start === 'number' && typeof sg.end === 'number' && sg.end >= sg.start) {
            segments.push({ start: sg.start, end: sg.end });
          }
        }
      }
      tasks.push({
        id: r.id,
        name: typeof r.name === 'string' ? r.name : '',
        segments,
        runningSince: typeof r.runningSince === 'number' ? r.runningSince : null,
      });
    }
  }
  return { lang: isLang(o.lang) ? o.lang : 'ja', tasks };
}

let saveChain: Promise<void> = Promise.resolve();
let saveQueued = false;
function queueSave(): void {
  saveQueued = true;
  saveChain = saveChain.then(async () => {
    if (!saveQueued) return;
    saveQueued = false;
    try {
      await idbSave(DB, state);
      hideSaveBanner();
    } catch {
      showSaveBanner();
    }
  }).catch(() => { showSaveBanner(); });
}
function flushSoon(): void {
  queueSave();
}
document.addEventListener('visibilitychange', () => { if (document.hidden) flushSoon(); });
window.addEventListener('pagehide', () => { idbPutNow(DB, state); queueSave(); });

function setLang(l: Lang): void {
  state.lang = l;
  t = dicts[l];
  document.documentElement.lang = l;
  document.title = t.app;
  queueSave();
  render();
}

function startOfDay(ms: number): number {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
}
function taskMs(task: Task, from: number, to: number, now: number): number {
  let n = 0;
  for (const seg of task.segments) n += overlap(seg.start, seg.end, from, to);
  if (task.runningSince != null) n += overlap(task.runningSince, now, from, to);
  return n;
}
function totalMs(from: number, to: number, now: number): number {
  return state.tasks.reduce((n, task) => n + taskMs(task, from, to, now), 0);
}
function fmt(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}
function dayLabel(ms: number): string {
  const d = new Date(ms);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function last7(now: number): { start: number; end: number; label: string; today: boolean }[] {
  const startToday = startOfDay(now);
  const out = [];
  for (let i = 6; i >= 0; i--) {
    const start = startToday - i * 86400000;
    out.push({ start, end: start + 86400000, label: dayLabel(start), today: i === 0 });
  }
  return out;
}
function todayText(now: number): string {
  const from = startOfDay(now);
  const to = from + 86400000;
  const d = new Date(now);
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const lines = [iso];
  let total = 0;
  for (const task of state.tasks) {
    const ms = taskMs(task, from, to, now);
    if (ms <= 0) continue;
    total += ms;
    lines.push(`${task.name.trim() || t.unnamed}\t${fmt(ms)}`);
  }
  lines.push(`${t.total}\t${fmt(total)}`);
  return lines.join('\n');
}

function stopTask(task: Task, now: number): void {
  if (task.runningSince == null) return;
  const end = Math.max(now, task.runningSince);
  task.segments.push({ start: task.runningSince, end });
  task.runningSince = null;
}
function startTask(task: Task): void {
  const now = Date.now();
  for (const other of state.tasks) {
    if (other.id !== task.id) stopTask(other, now);
  }
  if (task.runningSince == null) task.runningSince = now;
  queueSave();
  render();
}
function toggleTask(task: Task): void {
  if (task.runningSince != null) {
    stopTask(task, Date.now());
    queueSave();
    render();
  } else {
    startTask(task);
  }
}
function addTask(): void {
  const name = draft.trim();
  draft = '';
  const task: Task = { id: uid(), name, segments: [], runningSince: null };
  state.tasks.unshift(task);
  queueSave();
  render();
}
async function deleteTask(task: Task): Promise<void> {
  const ok = await confirmDialog(t.deleteAsk, t.deleteBody, t.del, t.cancel, true);
  if (!ok) return;
  state.tasks = state.tasks.filter((x) => x.id !== task.id);
  queueSave();
  render();
}

function render(): void {
  const now = Date.now();
  const from = startOfDay(now);
  const to = from + 86400000;
  const days = last7(now);
  const vals = days.map((d) => totalMs(d.start, d.end, now));
  const max = Math.max(...vals, 1);

  const addInput = h('input', {
    class: 'input grow',
    type: 'text',
    placeholder: t.taskPh,
    value: draft,
    autocomplete: 'off',
    'aria-label': t.taskPh,
    oninput: (e: Event) => { draft = (e.target as HTMLInputElement).value; },
    onkeydown: (e: Event) => {
      const ke = e as KeyboardEvent;
      if (ke.key === 'Enter') { ke.preventDefault(); addTask(); }
    },
  });

  app.replaceChildren(
    h('header', { class: 'topbar' },
      h('h1', {}, t.app),
      langToggle(state.lang, setLang),
    ),
    h('main', {},
      h('p', { class: 'subhead' }, t.sub),
      h('section', { class: 'card today-card' },
        h('div', { class: 'lbl' }, t.today),
        h('div', { class: 'big num js-today', 'aria-live': 'polite' }, fmt(totalMs(from, to, now))),
      ),
      h('div', { class: 'row' },
        addInput,
        h('button', { class: 'btn primary', type: 'button', onclick: addTask }, t.add),
      ),
      state.tasks.length === 0
        ? h('p', { class: 'empty' }, t.empty)
        : h('div', { style: 'display:flex;flex-direction:column;gap:10px' },
            ...state.tasks.map((task) => taskCard(task, from, to, now)),
          ),
      h('h2', { class: 'sec' }, t.week),
      h('section', { class: 'card' },
        h('div', { class: 'week' },
          ...days.map((d, i) => h('div', { class: 'col' + (d.today ? ' today' : '') },
            h('div', { class: 'track' },
              h('div', { class: 'js-bar bar', style: `height:${Math.max(4, Math.round(((vals[i] ?? 0) / max) * 86))}px` }),
            ),
            h('div', { class: 'lbl' }, d.label),
          )),
        ),
      ),
      h('button', {
        class: 'btn block',
        type: 'button',
        onclick: async () => {
          const ok = await copyText(todayText(Date.now()));
          toast(ok ? t.copied : t.copyFail);
        },
      }, t.copyToday),
    ),
    h('p', { class: 'foot' }, t.privacy),
  );
}

function taskCard(task: Task, from: number, to: number, now: number): HTMLElement {
  const running = task.runningSince != null;
  return h('article', { class: 'card task' + (running ? ' run' : '') },
    h('input', {
      class: 'input',
      type: 'text',
      value: task.name,
      placeholder: t.taskPh,
      'aria-label': t.taskPh,
      autocomplete: 'off',
      oninput: (e: Event) => {
        task.name = (e.target as HTMLInputElement).value;
        queueSave();
      },
    }),
    h('div', { class: 'task-meta' },
      h('span', { class: 'muted small' }, t.taskToday),
      h('span', { class: 'time num js-tasktime', 'data-id': task.id }, fmt(taskMs(task, from, to, now))),
    ),
    h('div', { class: 'row' },
      h('button', {
        class: 'btn primary grow',
        type: 'button',
        onclick: () => toggleTask(task),
      }, running ? t.stop : t.start),
      h('button', {
        class: 'btn danger',
        type: 'button',
        onclick: () => { void deleteTask(task); },
      }, t.del),
    ),
  );
}

function tick(): void {
  const todayEl = document.querySelector('.js-today');
  if (!todayEl) return;
  const now = Date.now();
  const from = startOfDay(now);
  const to = from + 86400000;
  todayEl.textContent = fmt(totalMs(from, to, now));
  document.querySelectorAll<HTMLElement>('.js-tasktime').forEach((el) => {
    const task = state.tasks.find((x) => x.id === el.dataset.id);
    if (task) el.textContent = fmt(taskMs(task, from, to, now));
  });
  const days = last7(now);
  const vals = days.map((d) => totalMs(d.start, d.end, now));
  const max = Math.max(...vals, 1);
  document.querySelectorAll<HTMLElement>('.js-bar').forEach((el, i) => {
    el.style.height = `${Math.max(4, Math.round(((vals[i] ?? 0) / max) * 86))}px`;
  });
}

async function boot(): Promise<void> {
  await askPersist();
  try {
    state = normalize(await idbLoad(DB));
  } catch {
    state = { lang: 'ja', tasks: [] };
    showSaveBanner();
  }
  t = dicts[state.lang];
  document.documentElement.lang = state.lang;
  document.title = t.app;
  render();
  window.setInterval(tick, 500);
}
void boot();
