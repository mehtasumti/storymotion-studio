import { APP_ID, SCHEMA_VERSION, sanitizeSettings, validateProjectData } from './projectJson.js';

// Fixed key (not tied to SCHEMA_VERSION) so projects saved by older versions still load.
export const STORAGE_KEY = 'storymotion-studio:project:v1';
const BACKUP_KEY = `${STORAGE_KEY}:corrupt-backup`;
const UNAVAILABLE =
  'Browser storage is unavailable (private browsing or blocked site data). Your work will not survive a reload — use Export JSON to keep it.';

function getStorage() {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const probe = '__storymotion_probe__';
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return window.localStorage;
  } catch {
    return null;
  }
}

function quarantine(storage, raw) {
  try { storage.setItem(BACKUP_KEY, raw); } catch { /* ignore */ }
  try { storage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  return {
    ok: false,
    reason: 'corrupted',
    error: 'Your saved project could not be read, so the app started fresh. A raw copy was kept in browser storage for recovery.',
    state: null,
  };
}

const isQuotaError = (err) =>
  err && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED' || err.code === 22 || err.code === 1014);

export function loadState() {
  const storage = getStorage();
  if (!storage) return { ok: false, reason: 'unavailable', error: UNAVAILABLE, state: null };
  let raw;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return { ok: false, reason: 'unavailable', error: UNAVAILABLE, state: null };
  }
  if (!raw) return { ok: true, state: null };

  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return quarantine(storage, raw);
  }
  if (!data || typeof data !== 'object' || data.app !== APP_ID) return quarantine(storage, raw);

  const draft = sanitizeSettings(data.draft || data.settings || {});
  let board = null;
  if (Array.isArray(data.scenes) && data.scenes.length > 0) {
    const result = validateProjectData({
      schemaVersion: data.schemaVersion,
      settings: data.settings || data.draft || {},
      scenes: data.scenes,
      meta: data.meta,
      video: data.video,
    });
    if (!result.ok) return quarantine(storage, raw);
    board = { settings: result.project.settings, scenes: result.project.scenes, meta: result.project.meta, video: result.project.video };
  }
  const ui = {
    lockTotal: data.ui?.lockTotal !== false,
    hasEdits: data.ui?.hasEdits === true,
    view: data.ui?.view === 'video' ? 'video' : 'storyboard',
  };
  return { ok: true, state: { draft, board, ui, updatedAt: data.updatedAt } };
}

export function saveState({ draft, board, ui }) {
  const storage = getStorage();
  if (!storage) return { ok: false, reason: 'unavailable', error: UNAVAILABLE };
  const payload = {
    schemaVersion: SCHEMA_VERSION,
    app: APP_ID,
    settings: board?.settings ?? null,
    scenes: board?.scenes ?? [],
    meta: board?.meta ?? null,
    video: board?.video ?? null,
    draft,
    ui,
    updatedAt: new Date().toISOString(),
  };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return { ok: true, savedAt: payload.updatedAt };
  } catch (err) {
    const quota = isQuotaError(err);
    return {
      ok: false,
      reason: quota ? 'quota' : 'error',
      error: quota
        ? 'Browser storage is full, so your latest changes were not saved. Export JSON now, then free up space.'
        : 'Could not save to browser storage. Export JSON to keep your work.',
    };
  }
}

export function clearState() {
  const storage = getStorage();
  if (!storage) return;
  try { storage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}
