/**
 * Video export, entirely in the browser.
 *
 * 1. Preferred: WebCodecs + Mediabunny. Frame-exact, faster than real time.
 *    WebM = VP9/VP8 video + Opus audio. MP4 = H.264 video + AAC audio, and only
 *    when this browser can really encode both.
 * 2. Fallback: MediaRecorder recording of the canvas in real time (takes as
 *    long as the video). Used when WebCodecs is missing.
 *
 * Every export is read back and checked (duration, size, tracks) before it is
 * offered for download, so the app never claims a format that did not work.
 */
import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSource,
  Conversion,
  Input,
  Mp4OutputFormat,
  Output,
  WebMOutputFormat,
  canEncodeAudio,
  canEncodeVideo,
} from 'mediabunny';
import { FPS, QUALITIES, buildAudioSchedule, buildVideoPlan, outputSize } from './videoModel.js';
import { drawFrame, layoutCaptions } from './renderer.js';
import { loadScheduleBuffers, renderMix, scheduleAudio } from './audioEngine.js';
import { loadImageBitmap } from './mediaFiles.js';

export class ExportCancelledError extends Error {
  constructor() {
    super('Export cancelled.');
    this.name = 'ExportCancelledError';
  }
}

export class ExportError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = 'ExportError';
    this.cause = cause;
  }
}

const AUDIO_BITRATE = 160_000;
const WEBM_VIDEO_CODECS = ['vp9', 'vp8'];
const RECORDER_TYPES = {
  webm: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
  mp4: ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4'],
};
const CODEC_NAMES = { avc: 'H.264', hevc: 'H.265', vp9: 'VP9', vp8: 'VP8', av1: 'AV1', aac: 'AAC', opus: 'Opus', vorbis: 'Vorbis', mp3: 'MP3' };

/** Optional overrides for automated testing (never set by the app UI). */
const debug = () => (typeof window !== 'undefined' && window.__storymotionExportDebug) || {};

function hasWebCodecs() {
  return typeof VideoEncoder !== 'undefined' && typeof VideoFrame !== 'undefined';
}

function recorderType(format) {
  if (typeof MediaRecorder === 'undefined' || typeof HTMLCanvasElement === 'undefined') return null;
  if (typeof HTMLCanvasElement.prototype.captureStream !== 'function') return null;
  return RECORDER_TYPES[format].find((t) => MediaRecorder.isTypeSupported?.(t)) || null;
}

async function firstVideoCodec(list, w, h, bitrate) {
  for (const codec of list) {
    // eslint-disable-next-line no-await-in-loop
    if (await canEncodeVideo(codec, { width: w, height: h, bitrate, frameRate: FPS }).catch(() => false)) return codec;
  }
  return null;
}

/**
 * What can this browser export?
 * Returns { webm: Plan|null, mp4: Plan|null, notes: string[] } where
 * Plan = { method: 'webcodecs'|'recorder', videoCodec, audioCodec, mimeType, realtime }.
 */
export async function detectExportSupport(aspectRatio, quality, { withAudio = true } = {}) {
  const { width, height } = outputSize(aspectRatio, quality);
  const bitrate = QUALITIES[quality].bitrate;
  const d = debug();
  const result = { webm: null, mp4: null, notes: [] };

  if (hasWebCodecs() && !d.forceRecorder) {
    const webmVideo = await firstVideoCodec(WEBM_VIDEO_CODECS, width, height, bitrate);
    const opus = await canEncodeAudio('opus', { numberOfChannels: 2, sampleRate: 48000, bitrate: AUDIO_BITRATE }).catch(() => false);
    if (webmVideo && (opus || !withAudio)) {
      result.webm = { method: 'webcodecs', videoCodec: webmVideo, audioCodec: opus ? 'opus' : null, realtime: false };
    }
    const mp4Video = d.mp4VideoCodec || (await firstVideoCodec(['avc'], width, height, bitrate));
    const mp4Audio = d.mp4AudioCodec || ((await canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: 48000, bitrate: AUDIO_BITRATE }).catch(() => false)) ? 'aac' : null);
    if (mp4Video && (mp4Audio || !withAudio)) {
      result.mp4 = { method: 'webcodecs', videoCodec: mp4Video, audioCodec: mp4Audio, realtime: false };
    } else if (!mp4Video) {
      result.notes.push('This browser cannot encode H.264 video, so MP4 export is not available here.');
    } else {
      result.notes.push('This browser cannot encode AAC audio, so MP4 export is not available here.');
    }
  } else {
    result.notes.push('Fast export (WebCodecs) is not available in this browser, so videos are recorded in real time.');
  }

  for (const format of ['webm', 'mp4']) {
    if (result[format]) continue;
    const mimeType = recorderType(format);
    if (mimeType) result[format] = { method: 'recorder', mimeType, realtime: true };
  }
  if (!result.webm && !result.mp4) {
    result.notes.push('This browser cannot create video files. Please use a recent desktop Chrome, Edge or Firefox.');
  }
  return result;
}

async function loadImages(plan) {
  const ids = [...new Set(plan.segments.map((s) => s.imageId).filter(Boolean))];
  const images = new Map();
  const missing = [];
  await Promise.all(
    ids.map(async (id) => {
      const img = await loadImageBitmap(id);
      if (img) images.set(id, img);
      else missing.push(id);
    }),
  );
  return { images, missing };
}

function makeCanvas(width, height, needsElement) {
  if (!needsElement && typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/* ------------------------------ WebCodecs ------------------------------ */

async function exportWithWebCodecs({ format, plan, state, mix, support, quality, onProgress, signal, canvas }) {
  const { width, height } = canvas;
  const output = new Output({
    format: format === 'mp4' ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(),
    target: new BufferTarget(),
  });
  const videoSource = new CanvasSource(canvas, {
    codec: support.videoCodec,
    bitrate: QUALITIES[quality].bitrate,
    keyFrameInterval: 2,
    latencyMode: 'quality',
  });
  output.addVideoTrack(videoSource, { frameRate: FPS });
  let audioSource = null;
  if (mix && support.audioCodec) {
    audioSource = new AudioBufferSource({ codec: support.audioCodec, bitrate: AUDIO_BITRATE });
    output.addAudioTrack(audioSource);
  }

  const abort = () => output.cancel().catch(() => {});
  try {
    await output.start();
    if (audioSource) {
      await audioSource.add(mix);
      audioSource.close();
    }
    const ctx = canvas.getContext('2d');
    const frames = Math.round(plan.total * FPS);
    for (let i = 0; i < frames; i += 1) {
      if (signal?.aborted) throw new ExportCancelledError();
      const t = i / FPS;
      drawFrame(ctx, t, state);
      // eslint-disable-next-line no-await-in-loop
      await videoSource.add(t, 1 / FPS);
      if (i % 10 === 0) {
        onProgress({ phase: 'video', progress: i / frames, frame: i, frames });
        // eslint-disable-next-line no-await-in-loop
        await tick();
      }
    }
    videoSource.close();
    onProgress({ phase: 'finalizing', progress: 1 });
    await output.finalize();
  } catch (err) {
    await abort();
    throw err;
  }
  const mimeType = await output.getMimeType().catch(() => (format === 'mp4' ? 'video/mp4' : 'video/webm'));
  return new Blob([output.target.buffer], { type: mimeType.split(';')[0] });
}

/* ----------------------------- MediaRecorder ---------------------------- */

async function exportWithRecorder({ plan, state, scenes, video, support, quality, onProgress, signal, canvas }) {
  const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
  const stream = canvas.captureStream(FPS);
  let audioCtx = null;
  const schedule = buildAudioSchedule(scenes, video);
  const { buffers } = schedule.items.length ? await loadScheduleBuffers(schedule) : { buffers: new Map() };
  if (buffers.size && AC) {
    audioCtx = new AC();
    if (audioCtx.state === 'suspended') await audioCtx.resume();
    const dest = audioCtx.createMediaStreamDestination();
    state.audioDest = dest;
    dest.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
  }
  const recorder = new MediaRecorder(stream, {
    mimeType: support.mimeType,
    videoBitsPerSecond: QUALITIES[quality].bitrate,
    audioBitsPerSecond: AUDIO_BITRATE,
  });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data && e.data.size && chunks.push(e.data);
  const stopped = new Promise((resolve, reject) => {
    recorder.onstop = resolve;
    recorder.onerror = (e) => reject(new ExportError('The browser recorder failed.', e.error));
  });

  const ctx = canvas.getContext('2d');
  drawFrame(ctx, 0, state);
  recorder.start(500);
  // Start the timeline almost immediately so the recording does not begin with a pause.
  const clockStart = (audioCtx ? audioCtx.currentTime : performance.now() / 1000) + 0.02;
  if (audioCtx) scheduleAudio(audioCtx, state.audioDest, schedule, buffers, { from: 0, at: clockStart, ducking: video.ducking !== false });
  const now = () => (audioCtx ? audioCtx.currentTime : performance.now() / 1000);

  try {
    await new Promise((resolve, reject) => {
      const loop = () => {
        if (signal?.aborted) {
          reject(new ExportCancelledError());
          return;
        }
        const t = Math.max(0, now() - clockStart);
        drawFrame(ctx, Math.min(t, plan.total - 0.001), state);
        onProgress({ phase: 'recording', progress: Math.min(1, t / plan.total) });
        if (t >= plan.total + 0.05) resolve();
        else setTimeout(loop, 1000 / FPS / 2);
      };
      loop();
    });
  } finally {
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped.catch(() => {});
    stream.getTracks().forEach((track) => track.stop());
    if (audioCtx) audioCtx.close().catch(() => {});
  }
  if (signal?.aborted) throw new ExportCancelledError();
  let blob = new Blob(chunks, { type: support.mimeType.split(';')[0] });
  // Real-time recordings often lack duration info; remux (no re-encode) so players can seek.
  onProgress({ phase: 'finalizing', progress: 1 });
  try {
    const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const isMp4 = support.mimeType.startsWith('video/mp4');
    const out = new Output({ format: isMp4 ? new Mp4OutputFormat({ fastStart: 'in-memory' }) : new WebMOutputFormat(), target: new BufferTarget() });
    const conversion = await Conversion.init({ input, output: out });
    if (conversion.isValid) {
      await conversion.execute();
      blob = new Blob([out.target.buffer], { type: blob.type });
    }
    input.dispose();
  } catch {
    /* keep the original recording */
  }
  return blob;
}

/* ------------------------------ verification ----------------------------- */

function probePlayback(blob) {
  return new Promise((resolve) => {
    if (typeof document === 'undefined') {
      resolve(null);
      return;
    }
    const el = document.createElement('video');
    const url = URL.createObjectURL(blob);
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      el.removeAttribute('src');
      el.load();
      URL.revokeObjectURL(url);
      resolve(ok);
    };
    const timer = setTimeout(() => finish(null), 8000);
    el.muted = true;
    el.preload = 'auto';
    el.onloadeddata = () => finish(true);
    el.onerror = () => finish(false);
    el.src = url;
  });
}

/** Reads the exported file back and checks it. */
export async function verifyVideo(blob, expected) {
  const report = { ok: false, problems: [], duration: null, width: null, height: null, videoCodec: null, audioCodec: null, playable: null };
  let input = null;
  try {
    input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
    const vt = await input.getPrimaryVideoTrack();
    const at = await input.getPrimaryAudioTrack();
    report.duration = await input.computeDuration();
    if (!vt) report.problems.push('The file has no video track.');
    else {
      report.width = vt.displayWidth;
      report.height = vt.displayHeight;
      report.videoCodec = vt.codec;
    }
    report.audioCodec = at?.codec ?? null;
  } catch (err) {
    report.problems.push('The exported file could not be read back.');
    report.error = err?.message;
  } finally {
    input?.dispose();
  }
  if (report.duration != null && Math.abs(report.duration - expected.duration) > 0.25) {
    report.problems.push(`Length is ${report.duration.toFixed(2)}s instead of ${expected.duration}s.`);
  }
  if (report.width && (report.width !== expected.width || report.height !== expected.height)) {
    report.problems.push(`Size is ${report.width}×${report.height} instead of ${expected.width}×${expected.height}.`);
  }
  if (expected.withAudio && !report.audioCodec) report.problems.push('The file has no audio track.');
  if (expected.format === 'mp4' && report.videoCodec && report.videoCodec !== 'avc') {
    report.problems.push(`MP4 uses ${CODEC_NAMES[report.videoCodec] || report.videoCodec} video instead of H.264, so some players may not open it.`);
  }
  report.playable = await probePlayback(blob);
  if (report.playable === false) report.problems.push('This browser could not play the exported file.');
  report.ok = report.problems.length === 0 && !report.error;
  report.summary = [
    report.duration != null ? `${report.duration.toFixed(1)}s` : null,
    report.width ? `${report.width}×${report.height}` : null,
    report.videoCodec ? CODEC_NAMES[report.videoCodec] || report.videoCodec : null,
    report.audioCodec ? `${CODEC_NAMES[report.audioCodec] || report.audioCodec} audio` : 'no audio',
  ]
    .filter(Boolean)
    .join(' · ');
  return report;
}

/* --------------------------------- main --------------------------------- */

/**
 * Exports the project. Returns { blob, fileName, report, method, missingImages, missingAudio }.
 * onProgress({ phase, progress 0..1 }) — phases: preparing, audio, video | recording, finalizing, verifying.
 */
export async function exportVideo({ board, video, format, quality, support, onProgress = () => {}, signal }) {
  const { scenes, settings } = board;
  if (!support) throw new ExportError(`${format.toUpperCase()} export is not available in this browser.`);
  const { width, height } = outputSize(settings.aspectRatio, quality);
  const plan = buildVideoPlan(scenes, video, { width, height });
  onProgress({ phase: 'preparing', progress: 0 });

  const { images, missing: missingImages } = await loadImages(plan);
  const canvas = makeCanvas(width, height, support.method === 'recorder');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ExportError('Could not create a drawing surface for the video.');
  const state = {
    plan,
    images,
    captionPages: layoutCaptions(ctx, scenes, video, width, height),
    captions: video.captions,
  };
  if (signal?.aborted) throw new ExportCancelledError();

  let blob;
  let missingAudio = [];
  let withAudio = false;
  try {
    if (support.method === 'webcodecs') {
      onProgress({ phase: 'audio', progress: 0 });
      const { buffer: mix, missing } = await renderMix(scenes, video);
      missingAudio = missing;
      withAudio = !!(mix && support.audioCodec);
      if (signal?.aborted) throw new ExportCancelledError();
      blob = await exportWithWebCodecs({ format, plan, state, mix, support, quality, onProgress, signal, canvas });
    } else {
      const schedule = buildAudioSchedule(scenes, video);
      withAudio = schedule.items.length > 0;
      blob = await exportWithRecorder({ plan, state, scenes, video, support, quality, onProgress, signal, canvas });
    }
  } catch (err) {
    if (err instanceof ExportCancelledError || signal?.aborted) throw new ExportCancelledError();
    if (err instanceof ExportError) throw err;
    const quota = /quota|memory|allocation/i.test(err?.message || '');
    throw new ExportError(
      quota
        ? 'The browser ran out of memory while making the video. Try 720p, close other tabs, and export again.'
        : `The video could not be encoded (${err?.message || 'unknown error'}). Try again, switch to WebM or 720p, or use another browser.`,
      err,
    );
  }

  onProgress({ phase: 'verifying', progress: 1 });
  const report = await verifyVideo(blob, { duration: plan.total, width, height, withAudio, format });
  const ext = format === 'mp4' ? 'mp4' : 'webm';
  return { blob, ext, report, method: support.method, missingImages, missingAudio, width, height };
}
