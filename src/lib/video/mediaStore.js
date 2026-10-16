/**
 * Local media storage (IndexedDB). Images and audio never leave this browser.
 * Blobs are stored under random ids; the project only keeps the ids.
 */
import { createId } from '../storyEngine.js';

const DB_NAME = 'storymotion-studio-media';
const DB_VERSION = 1;
const STORE = 'media';

let dbPromise = null;

export class MediaStoreError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'MediaStoreError';
    this.cause = cause;
  }
}

export function isMediaStoreSupported() {
  return typeof indexedDB !== 'undefined';
}

function openDb() {
  if (!isMediaStoreSupported()) {
    return Promise.reject(new MediaStoreError('This browser cannot store images and audio locally (IndexedDB is unavailable, e.g. in some private windows).'));
  }
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch (err) {
        reject(new MediaStoreError('Local media storage is blocked in this browser.', err));
        return;
      }
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      };
      req.onsuccess = () => {
        const db = req.result;
        db.onversionchange = () => {
          db.close();
          dbPromise = null;
        };
        resolve(db);
      };
      req.onerror = () => reject(new MediaStoreError('Could not open local media storage.', req.error));
      req.onblocked = () => reject(new MediaStoreError('Local media storage is busy in another tab. Close other StoryMotion tabs and retry.'));
    }).catch((err) => {
      dbPromise = null;
      throw err;
    });
  }
  return dbPromise;
}

function run(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, mode);
        const store = tx.objectStore(STORE);
        const request = fn(store);
        tx.oncomplete = () => resolve(request ? request.result : undefined);
        tx.onerror = () => {
          const err = tx.error;
          const quota = err && (err.name === 'QuotaExceededError' || /quota/i.test(err.message || ''));
          reject(
            new MediaStoreError(
              quota
                ? 'Browser storage is full. Remove some images or audio, or free up disk space, then try again.'
                : 'Could not save to local media storage.',
              err,
            ),
          );
        };
        tx.onabort = () => reject(new MediaStoreError('Saving media was interrupted. Please try again.', tx.error));
      }),
  );
}

/** Saves a Blob and returns its new id. */
export async function putMedia(blob, meta = {}) {
  const id = meta.id || `m-${createId()}`;
  await run('readwrite', (store) =>
    store.put({
      id,
      blob,
      type: blob.type || meta.type || 'application/octet-stream',
      name: meta.name || '',
      kind: meta.kind || 'other',
      size: blob.size,
      createdAt: Date.now(),
    }),
  );
  return id;
}

export async function getMedia(id) {
  if (!id) return null;
  return run('readonly', (store) => store.get(id)).then((rec) => rec ?? null);
}

export async function getMediaBlob(id) {
  const rec = await getMedia(id);
  return rec?.blob ?? null;
}

export async function deleteMedia(id) {
  if (!id) return;
  await run('readwrite', (store) => store.delete(id));
}

export async function listMediaIds() {
  return run('readonly', (store) => store.getAllKeys()).then((keys) => keys || []);
}

export async function clearAllMedia() {
  if (!isMediaStoreSupported()) return;
  await run('readwrite', (store) => store.clear());
}

async function listMediaInfo() {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const out = [];
        const tx = db.transaction(STORE, 'readonly');
        const req = tx.objectStore(STORE).openCursor();
        req.onsuccess = () => {
          const cursor = req.result;
          if (!cursor) return;
          out.push({ id: cursor.value.id, createdAt: cursor.value.createdAt || 0 });
          cursor.continue();
        };
        tx.oncomplete = () => resolve(out);
        tx.onerror = () => reject(tx.error);
      }),
  );
}

/**
 * Deletes stored items the project no longer references. Only items created
 * before `createdBefore` are touched, so an upload that is still being added
 * to the project is never removed.
 */
export async function pruneMedia(keepIds, { createdBefore = Date.now() } = {}) {
  const keep = keepIds instanceof Set ? keepIds : new Set(keepIds);
  const items = await listMediaInfo();
  const stale = items.filter((it) => !keep.has(it.id) && it.createdAt < createdBefore);
  for (const it of stale) await deleteMedia(it.id);
  return stale.length;
}

/** Rough usage figure for the UI ("12.4 MB used"). */
export async function storageEstimate() {
  try {
    if (navigator.storage?.estimate) {
      const { usage, quota } = await navigator.storage.estimate();
      return { usage, quota };
    }
  } catch {
    /* ignore */
  }
  return null;
}
