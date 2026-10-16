/**
 * Schedules the project's audio onto a Web Audio graph. Used for:
 *  - live preview (AudioContext, starting from any time t0), and
 *  - export (OfflineAudioContext rendering the full mix, sample-accurate).
 */
import { buildAudioSchedule, envelopeValueAt, musicEnvelope } from './videoModel.js';
import { loadAudioBuffer } from './mediaFiles.js';

export const MIX_SAMPLE_RATE = 48000;

/** Loads (decodes) every buffer the schedule needs. Missing files are reported, not fatal. */
export async function loadScheduleBuffers(schedule) {
  const ids = [...new Set(schedule.items.map((it) => it.id))];
  const buffers = new Map();
  const missing = [];
  await Promise.all(
    ids.map(async (id) => {
      const buf = await loadAudioBuffer(id);
      if (buf) buffers.set(id, buf);
      else missing.push(id);
    }),
  );
  return { buffers, missing };
}

/**
 * Connects sources for every clip overlapping [from, total) on `ctx`.
 * `at` is the context time that corresponds to timeline time `from`.
 * Returns the created source nodes (so preview can stop them).
 */
export function scheduleAudio(ctx, destination, schedule, buffers, { from = 0, at = ctx.currentTime, ducking = true } = {}) {
  const nodes = [];
  const env = musicEnvelope(schedule, { ducking });
  const musicBus = ctx.createGain();
  musicBus.connect(destination);
  // Music automation (fade in/out + ducking), shifted to context time.
  musicBus.gain.setValueAtTime(envelopeValueAt(env, from), at);
  for (const [t, v] of env) {
    if (t > from) musicBus.gain.linearRampToValueAtTime(v, at + (t - from));
  }
  nodes.push(musicBus);

  for (const item of schedule.items) {
    const buffer = buffers.get(item.id);
    if (!buffer) continue;
    const end = item.when + item.duration;
    if (end <= from + 0.005) continue;
    const skip = Math.max(0, from - item.when);
    const startAt = at + Math.max(0, item.when - from);
    const offset = item.offset + skip;
    const length = item.duration - skip;
    if (offset >= buffer.duration || length <= 0.005) continue;

    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const gain = ctx.createGain();
    // Short ramps avoid clicks at clip edges; voices stay exactly in place.
    const ramp = Math.min(0.012, length / 4);
    gain.gain.setValueAtTime(0, startAt);
    gain.gain.linearRampToValueAtTime(item.gain, startAt + ramp);
    gain.gain.setValueAtTime(item.gain, startAt + length - ramp);
    gain.gain.linearRampToValueAtTime(0, startAt + length);
    src.connect(gain);
    gain.connect(item.lane === 'music' ? musicBus : destination);
    src.start(startAt, offset, length);
    nodes.push(src, gain);
  }
  return nodes;
}

export function hasAudio(scenes, video) {
  return buildAudioSchedule(scenes, video).items.length > 0;
}

/** Renders the complete mix for export. Returns { buffer, missing } or { buffer: null } when there is no audio. */
export async function renderMix(scenes, video, { sampleRate = MIX_SAMPLE_RATE } = {}) {
  const schedule = buildAudioSchedule(scenes, video);
  if (!schedule.items.length) return { buffer: null, missing: [] };
  const { buffers, missing } = await loadScheduleBuffers(schedule);
  if (!buffers.size) return { buffer: null, missing };
  const Offline = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!Offline) throw new Error('This browser cannot mix audio (OfflineAudioContext missing).');
  const frames = Math.ceil(schedule.total * sampleRate);
  const ctx = new Offline(2, frames, sampleRate);
  // A gentle limiter keeps loud combinations (music + voice) from clipping.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -3;
  limiter.knee.value = 0;
  limiter.ratio.value = 20;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.1;
  limiter.connect(ctx.destination);
  scheduleAudio(ctx, limiter, schedule, buffers, { from: 0, at: 0, ducking: video.ducking !== false });
  const buffer = await ctx.startRendering();
  return { buffer, missing };
}

/* ------------------------------ live preview ------------------------------ */

/**
 * A small playback engine. The AudioContext clock is the master clock for
 * the preview, so pictures and sound stay locked together.
 */
export class PreviewAudio {
  constructor() {
    this.ctx = null;
    this.nodes = [];
    this.master = null;
  }

  ensure() {
    if (!this.ctx) {
      const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC({ latencyHint: 'playback' });
      this.master = this.ctx.createDynamicsCompressor();
      this.master.threshold.value = -3;
      this.master.ratio.value = 20;
      this.master.connect(this.ctx.destination);
    }
    return this.ctx;
  }

  /** Starts playback at timeline time t0. Returns the context time that maps to t0. */
  async start(t0, schedule, buffers, ducking) {
    const ctx = this.ensure();
    if (!ctx) return null;
    if (ctx.state === 'suspended') await ctx.resume();
    this.stop();
    const at = ctx.currentTime + 0.06;
    this.nodes = scheduleAudio(ctx, this.master, schedule, buffers, { from: t0, at, ducking });
    return at;
  }

  now() {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }

  stop() {
    for (const n of this.nodes) {
      try {
        if (typeof n.stop === 'function') n.stop();
        n.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.nodes = [];
  }

  close() {
    this.stop();
    if (this.ctx) this.ctx.close().catch(() => {});
    this.ctx = null;
  }
}
