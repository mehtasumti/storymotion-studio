/**
 * Importing user images/audio, plus in-memory caches of decoded media.
 * All processing happens locally in the browser.
 */
import { getMediaBlob, putMedia } from './mediaStore.js';

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
export const MAX_AUDIO_BYTES = 60 * 1024 * 1024;
export const MAX_IMAGE_EDGE = 2560;
export const IMAGE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/avif,image/bmp';
export const AUDIO_ACCEPT = 'audio/*,.mp3,.m4a,.aac,.wav,.ogg,.oga,.opus,.webm,.flac';
const SAMPLE_RATE = 48000;

const mb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(0)} MB`;

export class MediaImportError extends Error {
  constructor(message) {
    super(message);
    this.name = 'MediaImportError';
  }
}

function canvasToBlob(canvas, type, quality) {
  if (typeof canvas.convertToBlob === 'function') return canvas.convertToBlob({ type, quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Image encoding failed.'))), type, quality),
  );
}

function makeCanvas(w, h) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

async function decodeImage(blob) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(blob);
    } catch {
      /* fall back to <img> (e.g. some formats in older Safari) */
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const sizeOf = (img) => ({ w: img.naturalWidth || img.width, h: img.naturalHeight || img.height });

/**
 * Validates, downsizes (long edge ≤ 2560 px) and stores an image. Returns the
 * media id and dimensions. GIFs/animations become their first frame.
 */
export async function importImage(fileOrBlob, { name, source = 'upload' } = {}) {
  const type = fileOrBlob.type || '';
  if (type && !type.startsWith('image/')) throw new MediaImportError('That file is not an image. Use PNG, JPG or WebP.');
  if (fileOrBlob.size > MAX_IMAGE_BYTES) throw new MediaImportError(`That image is too large (max ${mb(MAX_IMAGE_BYTES)}).`);
  if (fileOrBlob.size === 0) throw new MediaImportError('That image file is empty.');

  let img;
  try {
    img = await decodeImage(fileOrBlob);
  } catch {
    throw new MediaImportError('This image could not be read. It may be damaged or in a format this browser does not support (try PNG or JPG).');
  }
  const { w, h } = sizeOf(img);
  if (!w || !h) throw new MediaImportError('This image has no size and cannot be used.');
  if (w < 64 || h < 64) throw new MediaImportError('This image is too small (minimum 64 × 64 pixels).');

  const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(w, h));
  const tw = Math.max(1, Math.round(w * scale));
  const th = Math.max(1, Math.round(h * scale));
  let blob = fileOrBlob;
  const keepOriginal = scale === 1 && /image\/(jpeg|webp)/.test(type) && fileOrBlob.size < 6 * 1024 * 1024;
  if (!keepOriginal) {
    const canvas = makeCanvas(tw, th);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, tw, th); // flatten transparency onto black (it is a video frame)
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, tw, th);
    blob = await canvasToBlob(canvas, 'image/jpeg', 0.9);
  }
  if (typeof img.close === 'function') img.close();
  const id = await putMedia(blob, { name: name || fileOrBlob.name || 'image', kind: 'image' });
  return { id, width: tw, height: th, name: name || fileOrBlob.name || 'image', source };
}

let decodeCtx = null;
function getDecodeContext() {
  const Offline = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!Offline) throw new MediaImportError('This browser cannot process audio (Web Audio API missing).');
  if (!decodeCtx) decodeCtx = new Offline(2, SAMPLE_RATE, SAMPLE_RATE);
  return decodeCtx;
}

export async function decodeAudioBlob(blob) {
  const ctx = getDecodeContext();
  const data = await blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const p = ctx.decodeAudioData(data, resolve, reject);
    if (p && typeof p.then === 'function') p.then(resolve, reject);
  });
}

/** Validates, decodes (to learn the duration) and stores an audio file. */
export async function importAudio(file, { kind = 'audio' } = {}) {
  const type = file.type || '';
  const looksAudio = type.startsWith('audio/') || type === 'video/webm' || type === 'video/mp4' || /\.(mp3|m4a|aac|wav|ogg|oga|opus|webm|flac)$/i.test(file.name || '');
  if (!looksAudio) throw new MediaImportError('That file is not audio. Use MP3, M4A, WAV or OGG.');
  if (file.size > MAX_AUDIO_BYTES) throw new MediaImportError(`That audio file is too large (max ${mb(MAX_AUDIO_BYTES)}).`);
  if (file.size === 0) throw new MediaImportError('That audio file is empty.');
  let buffer;
  try {
    buffer = await decodeAudioBlob(file);
  } catch {
    throw new MediaImportError('This audio could not be decoded by your browser. Try MP3 or WAV.');
  }
  if (!buffer || buffer.duration < 0.05) throw new MediaImportError('This audio file is silent or too short.');
  const id = await putMedia(file, { name: file.name || kind, kind });
  audioCache.set(id, Promise.resolve(buffer));
  return { id, name: file.name || kind, duration: +buffer.duration.toFixed(3) };
}

/* ------------------------------ caches ------------------------------ */

const bitmapCache = new Map(); // id -> Promise<ImageBitmap|HTMLImageElement|null>
const audioCache = new Map(); // id -> Promise<AudioBuffer|null>
const urlCache = new Map(); // id -> Promise<string|null> (object URLs for thumbnails)

export function loadImageBitmap(id) {
  if (!id) return Promise.resolve(null);
  if (!bitmapCache.has(id)) {
    bitmapCache.set(
      id,
      getMediaBlob(id)
        .then((blob) => (blob ? decodeImage(blob) : null))
        .catch(() => null),
    );
  }
  return bitmapCache.get(id);
}

export function loadAudioBuffer(id) {
  if (!id) return Promise.resolve(null);
  if (!audioCache.has(id)) {
    audioCache.set(
      id,
      getMediaBlob(id)
        .then((blob) => (blob ? decodeAudioBlob(blob) : null))
        .catch(() => null),
    );
  }
  return audioCache.get(id);
}

export function mediaObjectUrl(id) {
  if (!id) return Promise.resolve(null);
  if (!urlCache.has(id)) {
    urlCache.set(
      id,
      getMediaBlob(id)
        .then((blob) => (blob ? URL.createObjectURL(blob) : null))
        .catch(() => null),
    );
  }
  return urlCache.get(id);
}

export function forgetMedia(id) {
  const bmp = bitmapCache.get(id);
  if (bmp) bmp.then((b) => b && typeof b.close === 'function' && b.close()).catch(() => {});
  bitmapCache.delete(id);
  audioCache.delete(id);
  const url = urlCache.get(id);
  if (url) url.then((u) => u && URL.revokeObjectURL(u)).catch(() => {});
  urlCache.delete(id);
}

export function forgetAllMedia() {
  [...new Set([...bitmapCache.keys(), ...audioCache.keys(), ...urlCache.keys()])].forEach(forgetMedia);
}

export const imageDimensions = sizeOf;
