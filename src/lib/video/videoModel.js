/**
 * StoryMotion Studio — video model (pure logic, no DOM).
 *
 * Turns a storyboard + video settings into a render plan: which image is on
 * screen at time t, how the still image moves (zoom / pan / tilt / drift),
 * how scenes transition, which caption page is visible, and when every audio
 * clip plays. The same plan drives the live preview and the exported file, so
 * the preview and the download always match.
 *
 * Videos are animated still images ("Ken Burns" style). Nothing here creates
 * AI character motion.
 */

export const VIDEO_SETTINGS_VERSION = 1;

export const MOTIONS = {
  'zoom-in': { label: 'Zoom in' },
  'zoom-out': { label: 'Zoom out' },
  'pan-left': { label: 'Pan left' },
  'pan-right': { label: 'Pan right' },
  'tilt-up': { label: 'Tilt up' },
  'tilt-down': { label: 'Tilt down' },
  drift: { label: 'Cinematic drift' },
  static: { label: 'Static (no motion)' },
};
export const MOTION_KEYS = Object.keys(MOTIONS);

export const MOTION_STRENGTHS = {
  subtle: { label: 'Subtle', amount: 0.07 },
  normal: { label: 'Normal', amount: 0.13 },
  strong: { label: 'Strong', amount: 0.22 },
};

export const CAPTION_SOURCES = {
  auto: 'Dialogue if present, otherwise voiceover',
  voiceover: 'Voiceover only',
  dialogue: 'Dialogue only',
  both: 'Dialogue and voiceover',
};
export const CAPTION_SIZES = { small: 0.046, medium: 0.056, large: 0.068 };
export const CAPTION_POSITIONS = ['bottom', 'middle', 'top'];
export const CAPTION_STYLES = { box: 'Dark box', outline: 'Outline', shadow: 'Soft shadow' };
export const CAPTION_COLORS = { '#ffffff': 'White', '#fde047': 'Yellow' };

export const QUALITIES = {
  '720p': { label: '720p (faster, smaller)', short: 720, bitrate: 5_000_000 },
  '1080p': { label: '1080p (sharper, slower)', short: 1080, bitrate: 10_000_000 },
};
export const FORMATS = ['webm', 'mp4'];
export const FPS = 30;

export const TRANSITION_KINDS = ['cut', 'dissolve', 'fade-black', 'fade-white'];
const DISSOLVE_SECONDS = 0.6;
const FADE_SECONDS = 0.8;
const END_FADE_SECONDS = 1.0;
const START_FADE_SECONDS = 0.5;

export const DEFAULT_CAPTIONS = {
  enabled: true,
  source: 'auto',
  size: 'medium',
  position: 'bottom',
  style: 'box',
  color: '#ffffff',
  uppercase: false,
};

export const DEFAULT_VOLUMES = { music: 0.5, narration: 1, dialogue: 1 };

export function defaultVideoSettings() {
  return {
    version: VIDEO_SETTINGS_VERSION,
    scenes: {},
    motionStrength: 'normal',
    fadeInStart: true,
    captions: { ...DEFAULT_CAPTIONS },
    music: null,
    volumes: { ...DEFAULT_VOLUMES },
    ducking: true,
    export: { format: 'webm', quality: '720p' },
  };
}

export function defaultSceneMedia() {
  return {
    imageId: null,
    imageName: '',
    imageSource: null,
    imageWidth: 0,
    imageHeight: 0,
    motion: 'auto',
    caption: null, // null = follow the storyboard text automatically
    narration: null,
    dialogue: null,
  };
}

/* --------------------------- sanitizing input --------------------------- */

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const clampNum = (v, min, max, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};
const safeStr = (v, max = 200) => (typeof v === 'string' ? v.slice(0, max) : '');
const safeId = (v) => (typeof v === 'string' && /^[\w-]{1,100}$/.test(v) ? v : null);

/** Audio clip reference: the audio itself lives in browser storage, keyed by id. */
export function sanitizeClip(raw, { music = false } = {}) {
  if (!isObj(raw)) return null;
  const id = safeId(raw.id);
  if (!id) return null;
  const clip = {
    id,
    name: safeStr(raw.name, 200) || 'audio',
    duration: clampNum(raw.duration, 0, 3600, 0),
    volume: clampNum(raw.volume, 0, 2, 1),
    offset: clampNum(raw.offset, 0, 600, 0),
  };
  if (music) clip.loop = raw.loop !== false;
  else clip.stopAtSceneEnd = raw.stopAtSceneEnd !== false;
  return clip;
}

export function sanitizeSceneMedia(raw) {
  const base = defaultSceneMedia();
  if (!isObj(raw)) return base;
  return {
    imageId: safeId(raw.imageId),
    imageName: safeStr(raw.imageName, 200),
    imageSource: raw.imageSource === 'ai' || raw.imageSource === 'upload' ? raw.imageSource : null,
    imageWidth: clampNum(raw.imageWidth, 0, 20000, 0),
    imageHeight: clampNum(raw.imageHeight, 0, 20000, 0),
    motion: raw.motion === 'auto' || MOTION_KEYS.includes(raw.motion) ? raw.motion : 'auto',
    caption: typeof raw.caption === 'string' ? raw.caption.slice(0, 2000) : null,
    narration: sanitizeClip(raw.narration),
    dialogue: sanitizeClip(raw.dialogue),
  };
}

/** Lenient: anything unknown falls back to defaults. Never throws. */
export function sanitizeVideoSettings(raw) {
  const d = defaultVideoSettings();
  if (!isObj(raw)) return d;
  const scenes = {};
  if (isObj(raw.scenes)) {
    for (const [key, value] of Object.entries(raw.scenes).slice(0, 60)) {
      if (safeId(key)) scenes[key] = sanitizeSceneMedia(value);
    }
  }
  const c = isObj(raw.captions) ? raw.captions : {};
  const v = isObj(raw.volumes) ? raw.volumes : {};
  const e = isObj(raw.export) ? raw.export : {};
  return {
    version: VIDEO_SETTINGS_VERSION,
    scenes,
    motionStrength: Object.hasOwn(MOTION_STRENGTHS, raw.motionStrength ?? '') ? raw.motionStrength : d.motionStrength,
    fadeInStart: raw.fadeInStart !== false,
    captions: {
      enabled: c.enabled !== false,
      source: Object.hasOwn(CAPTION_SOURCES, c.source ?? '') ? c.source : d.captions.source,
      size: Object.hasOwn(CAPTION_SIZES, c.size ?? '') ? c.size : d.captions.size,
      position: CAPTION_POSITIONS.includes(c.position) ? c.position : d.captions.position,
      style: Object.hasOwn(CAPTION_STYLES, c.style ?? '') ? c.style : d.captions.style,
      color: Object.hasOwn(CAPTION_COLORS, c.color ?? '') ? c.color : d.captions.color,
      uppercase: c.uppercase === true,
    },
    music: sanitizeClip(raw.music, { music: true }),
    volumes: {
      music: clampNum(v.music, 0, 1.5, d.volumes.music),
      narration: clampNum(v.narration, 0, 1.5, d.volumes.narration),
      dialogue: clampNum(v.dialogue, 0, 1.5, d.volumes.dialogue),
    },
    ducking: raw.ducking !== false,
    export: {
      format: FORMATS.includes(e.format) ? e.format : d.export.format,
      quality: Object.hasOwn(QUALITIES, e.quality ?? '') ? e.quality : d.export.quality,
    },
  };
}

export function getSceneMedia(video, sceneId) {
  return video?.scenes?.[sceneId] ? { ...defaultSceneMedia(), ...video.scenes[sceneId] } : defaultSceneMedia();
}

/** Every media id the project still uses (for cleaning up browser storage). */
export function referencedMediaIds(video) {
  const ids = new Set();
  if (!video) return ids;
  for (const m of Object.values(video.scenes || {})) {
    if (m?.imageId) ids.add(m.imageId);
    if (m?.narration?.id) ids.add(m.narration.id);
    if (m?.dialogue?.id) ids.add(m.dialogue.id);
  }
  if (video.music?.id) ids.add(video.music.id);
  return ids;
}

/**
 * After the storyboard is regenerated, scene IDs change. Carry images, motion
 * and audio over by scene position so the user does not lose uploaded media.
 * Custom caption text is dropped because the scene text changed.
 */
export function carryMediaByPosition(video, oldScenes, newScenes) {
  if (!video) return video;
  const scenes = {};
  newScenes.forEach((scene, i) => {
    const old = oldScenes?.[i];
    if (old && video.scenes?.[old.id]) scenes[scene.id] = { ...video.scenes[old.id], caption: null };
  });
  return { ...video, scenes };
}

/* ---------------------------- camera motion ---------------------------- */

const MOTION_RULES = [
  [/tilt[\s-]*up|crane up|pedestal up/i, 'tilt-up'],
  [/tilt[\s-]*down|crane down|pedestal down/i, 'tilt-down'],
  [/pull[\s-]*(back|out)|zoom[\s-]*out|dolly[\s-]*out|widen/i, 'zoom-out'],
  [/push[\s-]*in|dolly[\s-]*in|zoom[\s-]*in|rack focus|\bpush\b/i, 'zoom-in'],
  [/pan[\s-]*left|whip pan|orbit|\barc\b/i, 'pan-left'],
  [/pan[\s-]*right|tracking|lateral|follow/i, 'pan-right'],
  [/drift|handheld|parallax|float|sway/i, 'drift'],
  [/static|locked[\s-]*off/i, 'static'],
];

/** Picks an animation from the storyboard's camera direction text. */
export function autoMotion(cameraText) {
  const text = String(cameraText || '');
  const hit = MOTION_RULES.find(([re]) => re.test(text));
  return hit ? hit[1] : 'drift';
}

export function resolveMotion(scene, media) {
  return media?.motion && media.motion !== 'auto' ? media.motion : autoMotion(scene?.camera);
}

/**
 * View transform for a still image at progress p (0 = scene start, 1 = scene
 * end; values slightly outside 0..1 occur during transitions).
 * Returns { zoom, x, y }: zoom ≥ 1 relative to "cover" fit, and x/y in −1..1
 * describing where the view window sits inside the available travel.
 */
export function motionTransform(motion, p, strength = 'normal') {
  const a = (MOTION_STRENGTHS[strength] || MOTION_STRENGTHS.normal).amount;
  switch (motion) {
    case 'zoom-in':
      return { zoom: 1 + a * p, x: 0, y: 0 };
    case 'zoom-out':
      return { zoom: 1 + a * (1 - p), x: 0, y: 0 };
    case 'pan-left':
      return { zoom: 1 + a, x: 1 - 2 * p, y: 0 };
    case 'pan-right':
      return { zoom: 1 + a, x: -1 + 2 * p, y: 0 };
    case 'tilt-up':
      return { zoom: 1 + a, x: 0, y: 1 - 2 * p };
    case 'tilt-down':
      return { zoom: 1 + a, x: 0, y: -1 + 2 * p };
    case 'static':
      return { zoom: 1, x: 0, y: 0 };
    case 'drift':
    default:
      return { zoom: 1 + a * (0.55 + 0.35 * p), x: -0.45 + 0.9 * p, y: 0.3 - 0.6 * p };
  }
}

/**
 * Source rectangle (in image pixels) to draw so the image covers the frame,
 * then applies the motion transform. Pans never reveal empty edges.
 */
export function sourceRect(imgW, imgH, frameW, frameH, transform, strength = 'normal') {
  const cover = Math.max(frameW / imgW, frameH / imgH);
  const scale = cover * Math.max(1, transform.zoom);
  const sw = frameW / scale;
  const sh = frameH / scale;
  const slackX = (imgW - sw) / 2;
  const slackY = (imgH - sh) / 2;
  // Keep pan speed similar across image shapes: very wide images do not race across the frame.
  const a = (MOTION_STRENGTHS[strength] || MOTION_STRENGTHS.normal).amount;
  const travelX = Math.min(slackX, (imgW / Math.max(1, transform.zoom)) * a * 0.9);
  const travelY = Math.min(slackY, (imgH / Math.max(1, transform.zoom)) * a * 0.9);
  const cx = imgW / 2 + Math.max(-1, Math.min(1, transform.x)) * travelX;
  const cy = imgH / 2 + Math.max(-1, Math.min(1, transform.y)) * travelY;
  return { sx: cx - sw / 2, sy: cy - sh / 2, sw, sh };
}

/* ----------------------------- transitions ----------------------------- */

/** Maps free-text transition names to what the renderer can draw. */
export function transitionKind(text) {
  const t = String(text || '').toLowerCase();
  if (/fade to white|white/.test(t)) return 'fade-white';
  if (/fade/.test(t) && !/cross/.test(t)) return 'fade-black';
  if (/dissolve|cross[\s-]*fade|blend|mix/.test(t)) return 'dissolve';
  return 'cut';
}

/**
 * Build the render plan. Scene times come straight from the storyboard, so the
 * video uses the exact durations. Transitions straddle the cut point and never
 * change the total length.
 */
export function buildVideoPlan(scenes, video, settings = {}) {
  const v = video || defaultVideoSettings();
  const total = scenes.reduce((s, sc) => s + sc.duration, 0);
  const segments = scenes.map((scene, i) => {
    const media = getSceneMedia(v, scene.id);
    return {
      index: i,
      sceneId: scene.id,
      sceneNumber: scene.sceneNumber ?? i + 1,
      title: scene.title,
      start: scene.startTime,
      end: scene.endTime,
      duration: scene.duration,
      motion: resolveMotion(scene, media),
      imageId: media.imageId,
      transitionText: scene.transition,
      transitionOut: 'cut',
      transitionOutDuration: 0,
    };
  });

  segments.forEach((seg, i) => {
    const next = segments[i + 1];
    const kind = transitionKind(seg.transitionText);
    if (!next) {
      // Last scene: only a fade-out to black/white makes sense.
      if (kind === 'fade-black' || kind === 'fade-white' || kind === 'dissolve') {
        seg.transitionOut = kind === 'fade-white' ? 'fade-white' : 'fade-black';
        seg.transitionOutDuration = Math.min(END_FADE_SECONDS, seg.duration * 0.4);
      }
      return;
    }
    if (kind === 'cut') return;
    const base = kind === 'dissolve' ? DISSOLVE_SECONDS : FADE_SECONDS;
    seg.transitionOut = kind;
    seg.transitionOutDuration = Math.min(base, 0.4 * Math.min(seg.duration, next.duration));
  });

  return {
    total,
    width: settings.width,
    height: settings.height,
    strength: v.motionStrength,
    fadeIn: v.fadeInStart ? Math.min(START_FADE_SECONDS, (segments[0]?.duration ?? 1) * 0.3) : 0,
    segments,
  };
}

export function segmentIndexAt(plan, t) {
  const segs = plan.segments;
  if (!segs.length) return -1;
  if (t <= 0) return 0;
  if (t >= plan.total) return segs.length - 1;
  // Durations are integers ≥ 1, scenes ≤ 30: a linear scan is plenty fast.
  for (let i = 0; i < segs.length; i += 1) if (t < segs[i].end) return i;
  return segs.length - 1;
}

const progressOf = (seg, t) => (t - seg.start) / Math.max(0.001, seg.duration);

/**
 * Describes what is on screen at time t as layers:
 *   [{ segment, progress, alpha }] drawn bottom to top, plus an overlay
 *   { color, alpha } (fade to black/white) drawn above the images.
 */
export function frameAt(plan, t) {
  const i = segmentIndexAt(plan, t);
  if (i < 0) return { layers: [], overlay: null, index: -1 };
  const segs = plan.segments;
  const seg = segs[i];
  const prev = segs[i - 1];
  const layers = [{ segment: seg, progress: progressOf(seg, t), alpha: 1 }];
  let overlay = null;

  // Dissolve: the window is centred on the cut point.
  if (seg.transitionOut === 'dissolve' && segs[i + 1]) {
    const d = seg.transitionOutDuration;
    const from = seg.end - d / 2;
    if (t >= from) {
      const next = segs[i + 1];
      layers.push({ segment: next, progress: progressOf(next, t), alpha: (t - from) / d });
    }
  }
  if (prev && prev.transitionOut === 'dissolve') {
    const d = prev.transitionOutDuration;
    if (t < seg.start + d / 2) {
      const mix = (t - (prev.end - d / 2)) / d; // 0.5 … 1
      layers.unshift({ segment: prev, progress: progressOf(prev, t), alpha: 1 });
      layers[1].alpha = Math.max(0, Math.min(1, mix));
    }
  }

  // Fades through black/white: out over the last half, in over the first half.
  const fadeColor = (kind) => (kind === 'fade-white' ? '#ffffff' : '#000000');
  if ((seg.transitionOut === 'fade-black' || seg.transitionOut === 'fade-white') && seg.transitionOutDuration > 0) {
    const half = segs[i + 1] ? seg.transitionOutDuration / 2 : seg.transitionOutDuration;
    if (t >= seg.end - half) overlay = { color: fadeColor(seg.transitionOut), alpha: (t - (seg.end - half)) / half };
  }
  if (prev && (prev.transitionOut === 'fade-black' || prev.transitionOut === 'fade-white')) {
    const half = prev.transitionOutDuration / 2;
    if (t < seg.start + half) overlay = { color: fadeColor(prev.transitionOut), alpha: 1 - (t - seg.start) / half };
  }
  if (plan.fadeIn > 0 && t < plan.fadeIn) {
    const a = 1 - t / plan.fadeIn;
    if (!overlay || overlay.alpha < a) overlay = { color: '#000000', alpha: a };
  }
  if (overlay) overlay.alpha = Math.max(0, Math.min(1, overlay.alpha));
  return { layers, overlay, index: i };
}

/* ------------------------------- captions ------------------------------ */

const stripOuterQuotes = (line) => line.trim().replace(/^[“"]+|[”"]+$/g, '').trim();

/** The caption text the storyboard suggests for a scene (before user edits). */
export function autoCaptionText(scene, source = 'auto') {
  const dialogue = String(scene?.dialogue || '')
    .split('\n')
    .map(stripOuterQuotes)
    .filter(Boolean)
    .join(' ');
  const voiceover = String(scene?.voiceover || '').trim();
  switch (source) {
    case 'voiceover':
      return voiceover;
    case 'dialogue':
      return dialogue;
    case 'both':
      return [dialogue, voiceover].filter(Boolean).join(' ');
    case 'auto':
    default:
      return dialogue || voiceover;
  }
}

export function captionTextFor(scene, media, captions) {
  const raw = media?.caption != null ? media.caption : autoCaptionText(scene, captions?.source);
  const clean = String(raw || '').replace(/\s+/g, ' ').trim();
  return captions?.uppercase ? clean.toUpperCase() : clean;
}

/** Greedy word wrap with a pluggable measure(text) → width function. */
export function wrapWords(text, maxWidth, measure) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (!line || measure(candidate) <= maxWidth) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Splits a scene caption into readable pages (max `maxLines` lines each) and
 * times them across the scene in proportion to their length.
 * Returns [{ lines, start, end }] in timeline seconds.
 */
/**
 * Splits words into `count` chunks of similar length, preferring breaks right
 * after punctuation (sentence ends, commas) so each caption page reads as a
 * natural phrase.
 */
function chunkWords(words, count, punctWeight = 1) {
  if (count <= 1) return [words];
  const lengths = words.map((w) => w.length + 1);
  const total = lengths.reduce((a, b) => a + b, 0);
  const chunks = [];
  let start = 0;
  for (let c = 1; c < count; c += 1) {
    const remainingChunks = count - c + 1;
    const remaining = lengths.slice(start).reduce((a, b) => a + b, 0);
    const target = remaining / remainingChunks;
    let acc = 0;
    let best = -1;
    let bestScore = Infinity;
    for (let k = start; k < words.length - (count - c); k += 1) {
      acc += lengths[k];
      const off = Math.abs(acc - target) / Math.max(1, target);
      if (off > 0.45 && acc > target) break;
      const punct = punctWeight * (/[.!?…]["”’)]?$/.test(words[k]) ? 0.6 : /[,;:—–-]["”’)]?$/.test(words[k]) ? 0.5 : 0);
      const score = off - punct;
      if (score < bestScore) {
        bestScore = score;
        best = k;
      }
    }
    if (best < start) best = start;
    chunks.push(words.slice(start, best + 1));
    start = best + 1;
  }
  chunks.push(words.slice(start));
  const nonEmpty = chunks.filter((ch) => ch.length);
  return total && nonEmpty.length ? nonEmpty : [words];
}

export function captionPages(text, sceneStart, sceneEnd, { maxWidth, measure, maxLines = 2 }) {
  const allLines = wrapWords(text, maxWidth, measure);
  if (!allLines.length) return [];
  const words = String(text).split(/\s+/).filter(Boolean);
  let pages = null;
  // Fewest pages that fit, balanced and broken at punctuation where possible.
  // Try phrase-aware breaks first, then evenly balanced ones, before adding another page.
  for (let count = Math.ceil(allLines.length / maxLines); count <= allLines.length + 1 && !pages; count += 1) {
    for (const weight of [1, 0]) {
      const candidate = chunkWords(words, count, weight).map((chunk) => wrapWords(chunk.join(' '), maxWidth, measure));
      if (candidate.every((p) => p.length <= maxLines)) {
        pages = candidate;
        break;
      }
    }
  }
  if (!pages) {
    pages = [];
    for (let k = 0; k < allLines.length; k += maxLines) pages.push(allLines.slice(k, k + maxLines));
  }
  const pad = Math.min(0.15, (sceneEnd - sceneStart) * 0.05);
  const from = sceneStart + pad;
  const span = Math.max(0.2, sceneEnd - pad - from);
  const weights = pages.map((p) => Math.max(8, p.join(' ').length));
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  let t = from;
  return pages.map((p, k) => {
    const end = k === pages.length - 1 ? from + span : t + (span * weights[k]) / totalWeight;
    const page = { lines: p, start: t, end };
    t = end;
    return page;
  });
}

/* --------------------------------- audio -------------------------------- */

const DUCK_LEVEL = 0.35;
const DUCK_RAMP = 0.25;
const MUSIC_FADE_IN = 1.0;
const MUSIC_FADE_OUT = 1.5;

/**
 * Every audio clip with its exact timeline position:
 *   { id, lane, when, offset, duration, gain }
 * `when` = timeline seconds, `offset` = seconds into the source file.
 */
export function buildAudioSchedule(scenes, video, durations = {}) {
  const v = video || defaultVideoSettings();
  const total = scenes.reduce((s, sc) => s + sc.duration, 0);
  const lengthOf = (clip) => durations[clip.id] ?? clip.duration ?? 0;
  const items = [];

  scenes.forEach((scene) => {
    const media = getSceneMedia(v, scene.id);
    for (const lane of ['narration', 'dialogue']) {
      const clip = media[lane];
      if (!clip) continue;
      const len = lengthOf(clip);
      const when = scene.startTime + Math.min(clip.offset || 0, Math.max(0, scene.duration - 0.05));
      const limit = clip.stopAtSceneEnd === false ? total : scene.endTime;
      const duration = Math.max(0, Math.min(len, limit - when));
      if (duration <= 0.01) continue;
      items.push({
        id: clip.id,
        lane,
        sceneId: scene.id,
        when,
        offset: 0,
        duration,
        gain: (clip.volume ?? 1) * (v.volumes?.[lane] ?? 1),
      });
    }
  });

  const music = v.music;
  if (music && lengthOf(music) > 0.05 && total > 0) {
    const len = lengthOf(music);
    const start = Math.min(music.offset || 0, Math.max(0, len - 0.05));
    const gain = (music.volume ?? 1) * (v.volumes?.music ?? 0.5);
    let t = 0;
    let first = true;
    while (t < total - 0.001) {
      const srcOffset = first ? start : 0;
      const piece = Math.min(len - srcOffset, total - t);
      if (piece <= 0.001) break;
      items.push({ id: music.id, lane: 'music', when: t, offset: srcOffset, duration: piece, gain });
      t += piece;
      first = false;
      if (music.loop === false) break;
    }
  }
  return { total, items };
}

/** Voice windows merged, used for music ducking. */
export function voiceWindows(schedule) {
  const wins = schedule.items
    .filter((it) => it.lane !== 'music')
    .map((it) => [it.when, it.when + it.duration])
    .sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const w of wins) {
    const last = merged[merged.length - 1];
    if (last && w[0] <= last[1] + DUCK_RAMP * 2) last[1] = Math.max(last[1], w[1]);
    else merged.push([...w]);
  }
  return merged;
}

/**
 * Music volume automation as [time, multiplier] points (multiplier applies on
 * top of the music clip gain): fade in, fade out, and duck under voices.
 */
export function musicEnvelope(schedule, { ducking = true } = {}) {
  const total = schedule.total;
  if (!total) return [];
  const fadeIn = Math.min(MUSIC_FADE_IN, total / 4);
  const fadeOut = Math.min(MUSIC_FADE_OUT, total / 4);
  const level = (t) => {
    let g = 1;
    if (t < fadeIn) g = Math.min(g, t / fadeIn);
    if (t > total - fadeOut) g = Math.min(g, Math.max(0, (total - t) / fadeOut));
    return g;
  };
  const times = new Set([0, fadeIn, total - fadeOut, total]);
  const windows = ducking ? voiceWindows(schedule) : [];
  for (const [a, b] of windows) {
    [a - DUCK_RAMP, a, b, b + DUCK_RAMP].forEach((x) => times.add(Math.min(total, Math.max(0, x))));
  }
  const duckAt = (t) => {
    let d = 1;
    for (const [a, b] of windows) {
      if (t >= a && t <= b) return DUCK_LEVEL;
      if (t > a - DUCK_RAMP && t < a) d = Math.min(d, 1 - ((1 - DUCK_LEVEL) * (t - (a - DUCK_RAMP))) / DUCK_RAMP);
      if (t > b && t < b + DUCK_RAMP) d = Math.min(d, DUCK_LEVEL + ((1 - DUCK_LEVEL) * (t - b)) / DUCK_RAMP);
    }
    return d;
  };
  return [...times]
    .sort((x, y) => x - y)
    .map((t) => [t, +(level(t) * duckAt(t)).toFixed(4)]);
}

export function envelopeValueAt(points, t) {
  if (!points.length) return 1;
  if (t <= points[0][0]) return points[0][1];
  for (let k = 1; k < points.length; k += 1) {
    const [t1, v1] = points[k];
    const [t0, v0] = points[k - 1];
    if (t <= t1) return t1 === t0 ? v1 : v0 + ((v1 - v0) * (t - t0)) / (t1 - t0);
  }
  return points[points.length - 1][1];
}

/* ------------------------------ dimensions ----------------------------- */

export function outputSize(aspectRatio, quality) {
  const short = (QUALITIES[quality] || QUALITIES['720p']).short;
  const long = Math.round((short * 16) / 9 / 2) * 2;
  return aspectRatio === '16:9' ? { width: long, height: short } : { width: short, height: long };
}

/** Image size for optional AI generation (multiples of 16, ~1 megapixel). */
export function aiImageSize(aspectRatio) {
  return aspectRatio === '16:9' ? { width: 1344, height: 768 } : { width: 768, height: 1344 };
}
