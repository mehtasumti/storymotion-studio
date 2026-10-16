/**
 * Optional AI image generation through Pollinations (https://pollinations.ai).
 *
 * - Off by default. Nothing is sent anywhere until the user turns it on.
 * - Pollinations requires a key for image generation. Users create their own
 *   free key at enter.pollinations.ai (no card required at the time of
 *   writing; free usage is limited). StoryMotion has no account, server or
 *   paid plan of its own.
 * - Only the scene's image prompt, the image size and a seed are sent. The key
 *   is stored only on this device (and only if the user asks).
 */

export const AI_PROVIDER = {
  id: 'pollinations',
  name: 'Pollinations',
  endpoint: 'https://gen.pollinations.ai/image/',
  keyUrl: 'https://enter.pollinations.ai',
  termsUrl: 'https://pollinations.ai',
};

export const MAX_PROMPT_CHARS = 1500;
export const REQUEST_TIMEOUT_MS = 120_000;
const KEY_STORAGE = 'storymotion-studio:ai-key';
const PREFS_STORAGE = 'storymotion-studio:ai-prefs';

export class AiImageError extends Error {
  constructor(message, { code = 'error', retryable = true, retryAfter = null, fatal = false } = {}) {
    super(message);
    this.name = 'AiImageError';
    this.code = code;
    this.retryable = retryable;
    this.retryAfter = retryAfter;
    this.fatal = fatal; // stop a batch (bad key, no credit)
  }
}

/** Stable 31-bit seed from text, so the same scene gives the same image until "Regenerate". */
export function seedFor(text, attempt = 0) {
  let h = 2166136261;
  const s = `${text}#${attempt}`;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % 2147483647;
}

export function cleanPrompt(prompt) {
  return String(prompt || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_PROMPT_CHARS);
}

export function buildImageUrl(prompt, { width, height, seed, model, key } = {}) {
  const url = new URL(AI_PROVIDER.endpoint + encodeURIComponent(cleanPrompt(prompt)));
  if (width) url.searchParams.set('width', String(width));
  if (height) url.searchParams.set('height', String(height));
  if (Number.isFinite(seed)) url.searchParams.set('seed', String(seed));
  if (model) url.searchParams.set('model', model);
  url.searchParams.set('nologo', 'true');
  if (key) url.searchParams.set('key', key);
  return url.toString();
}

function parseRetryAfter(value) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.min(600, n) : null;
}

/** Maps an HTTP response to a user-friendly error. */
export function errorForResponse(status, retryAfterHeader) {
  const retryAfter = parseRetryAfter(retryAfterHeader);
  if (status === 401 || status === 403) {
    return new AiImageError('Your Pollinations key was rejected. Check that you pasted the whole key, or create a new free key.', {
      code: 'auth',
      retryable: false,
      fatal: true,
    });
  }
  if (status === 402) {
    return new AiImageError('Your free Pollinations credit is used up for now. Wait for it to refill or upload your own images.', {
      code: 'credit',
      retryable: false,
      fatal: true,
    });
  }
  if (status === 429) {
    return new AiImageError(`Pollinations is limiting requests. Try again${retryAfter ? ` in about ${Math.ceil(retryAfter)} seconds` : ' in a minute'}.`, {
      code: 'rate',
      retryAfter,
    });
  }
  if (status === 400 || status === 413 || status === 414) {
    return new AiImageError('Pollinations could not accept this prompt. Try shortening or editing the image prompt.', { code: 'prompt', retryable: false });
  }
  if (status >= 500) {
    return new AiImageError('Pollinations is busy or down right now. Retry in a moment, or upload an image instead.', { code: 'server', retryAfter });
  }
  return new AiImageError(`Pollinations returned an unexpected response (${status}).`, { code: 'http' });
}

/**
 * Generates one image. Returns a Blob (image/*).
 * Sends the key as a Bearer header; if the browser blocks that request
 * (network/CORS failure), retries once with the key as a URL parameter, which
 * Pollinations documents for image GET requests.
 */
export async function generateImage(prompt, { key, width, height, seed, model, signal, fetchImpl = globalThis.fetch } = {}) {
  if (!key || !String(key).trim()) {
    throw new AiImageError('Add your free Pollinations key first.', { code: 'nokey', retryable: false, fatal: true });
  }
  if (!cleanPrompt(prompt)) throw new AiImageError('This scene has no image prompt.', { code: 'prompt', retryable: false });
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    throw new AiImageError('You appear to be offline. Connect to the internet or upload an image instead.', { code: 'offline' });
  }

  const k = String(key).trim();
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener('abort', onAbort);

  const attempt = (withHeader) =>
    fetchImpl(buildImageUrl(prompt, { width, height, seed, model, key: withHeader ? null : k }), {
      method: 'GET',
      headers: withHeader ? { Authorization: `Bearer ${k}` } : undefined,
      signal: timeout.signal,
      referrerPolicy: 'no-referrer',
      credentials: 'omit',
      cache: 'no-store',
    });

  try {
    let res;
    try {
      res = await attempt(true);
    } catch (err) {
      if (timeout.signal.aborted) throw err;
      res = await attempt(false);
    }
    if (!res.ok) throw errorForResponse(res.status, res.headers?.get?.('retry-after'));
    const type = res.headers?.get?.('content-type') || '';
    const blob = await res.blob();
    if (!/^image\//.test(type || blob.type) || blob.size < 1000) {
      throw new AiImageError('Pollinations did not return an image. Try again, or upload an image instead.', { code: 'notimage' });
    }
    return blob.type ? blob : new Blob([blob], { type });
  } catch (err) {
    if (err instanceof AiImageError) throw err;
    if (signal?.aborted) throw new AiImageError('Generation cancelled.', { code: 'cancelled', retryable: true });
    if (timeout.signal.aborted) {
      throw new AiImageError('Pollinations took too long to answer. Try again, or upload an image instead.', { code: 'timeout' });
    }
    throw new AiImageError(
      'Could not reach Pollinations. Check your internet connection; an ad-blocker or network filter may also be blocking it. You can always upload an image instead.',
      { code: 'network' },
    );
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/* --------------------------- key & preferences --------------------------- */

const safeLocal = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export function loadSavedKey() {
  try {
    return safeLocal()?.getItem(KEY_STORAGE) || '';
  } catch {
    return '';
  }
}

export function saveKey(key, remember) {
  try {
    const ls = safeLocal();
    if (!ls) return;
    if (remember && key) ls.setItem(KEY_STORAGE, key);
    else ls.removeItem(KEY_STORAGE);
  } catch {
    /* ignore */
  }
}

export function loadAiPrefs() {
  try {
    const raw = JSON.parse(safeLocal()?.getItem(PREFS_STORAGE) || '{}');
    return {
      enabled: raw.enabled === true,
      consented: raw.consented === true,
      model: typeof raw.model === 'string' ? raw.model.slice(0, 80) : '',
    };
  } catch {
    return { enabled: false, consented: false, model: '' };
  }
}

export function saveAiPrefs(prefs) {
  try {
    safeLocal()?.setItem(PREFS_STORAGE, JSON.stringify({ enabled: !!prefs.enabled, consented: !!prefs.consented, model: prefs.model || '' }));
  } catch {
    /* ignore */
  }
}

export function forgetAiData() {
  try {
    const ls = safeLocal();
    ls?.removeItem(KEY_STORAGE);
    ls?.removeItem(PREFS_STORAGE);
  } catch {
    /* ignore */
  }
}
