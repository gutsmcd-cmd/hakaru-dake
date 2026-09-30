const STORE = 'kv';
const KEY = 'state';

const openConns = new Map<string, IDBDatabase>();
const opening = new Map<string, Promise<IDBDatabase>>();

function openDb(name: string): Promise<IDBDatabase> {
  const existing = openConns.get(name);
  if (existing) return Promise.resolve(existing);
  const pending = opening.get(name);
  if (pending) return pending;
  const p = new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(name, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      const db = req.result;
      db.onversionchange = () => {
        db.close();
        openConns.delete(name);
      };
      openConns.set(name, db);
      opening.delete(name);
      resolve(db);
    };
    req.onerror = () => {
      opening.delete(name);
      reject(req.error ?? new Error('idb open'));
    };
  });
  opening.set(name, p);
  return p;
}

export async function idbLoad(name: string): Promise<unknown> {
  const db = await openDb(name);
  return await new Promise((resolve, reject) => {
    const r = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error ?? new Error('idb get'));
  });
}

export async function idbSave(name: string, value: unknown): Promise<void> {
  const snapshot = structuredClone(value);
  const db = await openDb(name);
  await new Promise<void>((resolve, reject) => {
    const r = db.transaction(STORE, 'readwrite').objectStore(STORE).put(snapshot, KEY);
    r.onsuccess = () => resolve();
    r.onerror = () => reject(r.error ?? new Error('idb put'));
  });
}

/**
 * Start a write inside pagehide. The connection is already open after load,
 * so the transaction begins before the page is discarded.
 */
export function idbPutNow(name: string, value: unknown): void {
  const db = openConns.get(name);
  if (!db) return;
  try {
    const snapshot = structuredClone(value);
    db.transaction(STORE, 'readwrite').objectStore(STORE).put(snapshot, KEY);
  } catch {
    /* the async save path reports the banner */
  }
}

/** Best-effort; a denial must not block using the app. */
export async function askPersist(): Promise<void> {
  try {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
      await navigator.storage.persist();
    }
  } catch {
    /* ignore */
  }
}
