// =============================================================================
// TrackStore.js — persistence for uploaded tracks.
//
// One IndexedDB object store holds everything about a player-supplied track:
//
//   {
//     id,        // stable key, generated below
//     name,      // the original filename, shown in the list
//     mime,      // file.type
//     blob,      // the raw uploaded file — replayed via a blob URL
//     duration,  // seconds, from the decoded buffer
//     peaks,     // Uint8Array of CONFIG.tracks.peakBuckets magnitudes
//     windows,   // [{ start, end }] — the authored super-mode regions
//     createdAt,
//   }
//
// IndexedDB rather than localStorage because localStorage stores strings only:
// a multi-MB audio file would have to be base64'd (a ~33% size penalty) and
// would blow the ~5MB per-origin quota on the first upload.
//
// Everything here degrades instead of throwing. In private-browsing modes
// IndexedDB may be missing or refuse to open, in which case the store falls
// back to an in-memory Map: uploads still work for the session, they just don't
// survive a reload, and the UI says so.
// =============================================================================

import { CONFIG } from '../config.js';

// crypto.randomUUID() only exists in a SECURE CONTEXT. Testing this game on a
// phone means opening http://192.168.x.x:5173 (Vite's printed Network URL),
// which is NOT secure — so randomUUID is undefined there and would throw on the
// very first upload on the device we most care about. Hence the fallback.
function newId() {
  if (globalThis.crypto?.randomUUID) {
    try {
      return globalThis.crypto.randomUUID();
    } catch {
      /* fall through */
    }
  }
  const rand = Math.random().toString(36).slice(2, 10);
  return `t${Date.now().toString(36)}${rand}`;
}

class TrackStore {
  constructor() {
    this.db = null;
    // null = not yet attempted, true/false once open() has resolved.
    this.available = null;
    this.unavailableReason = '';
    // Session-only fallback when IndexedDB can't be used.
    this.memory = new Map();
    this.openPromise = null;
  }

  // Idempotent: every caller can await open() without coordinating.
  open() {
    if (this.openPromise) return this.openPromise;

    this.openPromise = new Promise((resolve) => {
      if (!globalThis.indexedDB) {
        this.available = false;
        this.unavailableReason = 'This browser has no IndexedDB.';
        resolve(false);
        return;
      }

      let request;
      try {
        request = indexedDB.open(CONFIG.tracks.dbName, CONFIG.tracks.dbVersion);
      } catch (err) {
        this.available = false;
        this.unavailableReason = 'Storage is blocked in this browser mode.';
        resolve(false);
        return;
      }

      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(CONFIG.tracks.storeName)) {
          db.createObjectStore(CONFIG.tracks.storeName, { keyPath: 'id' });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.available = true;
        resolve(true);
      };

      // Private browsing in Firefox/Safari rejects the open outright.
      request.onerror = request.onblocked = () => {
        this.available = false;
        this.unavailableReason = 'Saving is unavailable in private browsing.';
        resolve(false);
      };
    });

    return this.openPromise;
  }

  // Wrap one IDB transaction in a promise. `mode` is 'readonly' | 'readwrite',
  // `run(store)` returns the IDBRequest whose result we want.
  transact(mode, run) {
    return new Promise((resolve, reject) => {
      let tx;
      try {
        tx = this.db.transaction(CONFIG.tracks.storeName, mode);
      } catch (err) {
        reject(err);
        return;
      }

      const request = run(tx.objectStore(CONFIG.tracks.storeName));
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? tx.error);
      // A quota failure surfaces on the transaction, not the request.
      tx.onabort = () => reject(tx.error ?? new Error('Storage transaction aborted.'));
    });
  }

  // Newest last, so the list order matches upload order.
  async list() {
    await this.open();
    if (!this.available) {
      return [...this.memory.values()].sort((a, b) => a.createdAt - b.createdAt);
    }
    const all = await this.transact('readonly', (s) => s.getAll());
    return all.sort((a, b) => a.createdAt - b.createdAt);
  }

  async get(id) {
    await this.open();
    if (!this.available) return this.memory.get(id) ?? null;
    return (await this.transact('readonly', (s) => s.get(id))) ?? null;
  }

  // Build a record from a decoded upload. Same filename twice makes two
  // records: silently overwriting someone's authored windows because they
  // happened to reuse a filename would be the worse surprise.
  async add({ name, mime, blob, duration, peaks }) {
    const record = {
      id: newId(),
      name,
      mime,
      blob,
      duration,
      peaks,
      windows: [],
      createdAt: Date.now(),
    };
    await this.put(record);
    return record;
  }

  async put(record) {
    await this.open();

    if (!this.available) {
      this.memory.set(record.id, record);
      return record;
    }

    try {
      await this.transact('readwrite', (s) => s.put(record));
    } catch (err) {
      if (err?.name === 'QuotaExceededError') {
        throw new Error('Not enough storage free to save this track.');
      }
      throw new Error('Could not save this track.');
    }
    return record;
  }

  async remove(id) {
    await this.open();
    if (!this.available) {
      this.memory.delete(id);
      return;
    }
    await this.transact('readwrite', (s) => s.delete(id));
  }

  // --- The selected-track pointer -------------------------------------------
  // Just an id, so it lives in localStorage alongside the best score rather
  // than costing an async IndexedDB read on every scene entry. Wrapped because
  // localStorage itself throws in some privacy modes.
  getSelectedId() {
    try {
      return localStorage.getItem(CONFIG.tracks.selectedKey) ?? CONFIG.tracks.defaultId;
    } catch {
      return CONFIG.tracks.defaultId;
    }
  }

  setSelectedId(id) {
    try {
      localStorage.setItem(CONFIG.tracks.selectedKey, id);
    } catch {
      /* selection just won't survive a reload */
    }
  }
}

// One store per page — IndexedDB connections are expensive to open and there is
// no reason for two scenes to hold separate ones.
export const trackStore = new TrackStore();
