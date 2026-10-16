/**
 * StoryMotion Studio — deterministic, template-based storyboard engine.
 *
 * This is NOT an AI model. It splits the user's story into beats (sentences,
 * lines, and — only when needed — clauses), then applies style, genre, camera,
 * audio and transition templates. No network calls are made.
 */

export const ENGINE_VERSION = 'template-engine-v1';
export const SCENE_COUNTS = [4, 6, 8, 10];
export const DURATIONS = [30, 60, 90];
export const ASPECT_RATIOS = ['9:16', '16:9'];
export const LANGUAGES = ['English', 'Hindi', 'Hinglish', 'Spanish', 'French', 'German', 'Portuguese', 'Japanese', 'Other'];
export const MIN_SCENE_DURATION = 1;
export const MAX_SCENE_DURATION = 90;
export const LIMITS = { storyMin: 10, storyMax: 12000, title: 120, character: 1500 };

export const STYLES = {
  cinematic: {
    label: 'Cinematic',
    prompt: 'Cinematic film still',
    finish: 'photorealistic, anamorphic lens look, shallow depth of field, subtle film grain, high dynamic range',
  },
  anime: {
    label: 'Anime',
    prompt: 'Anime key visual',
    finish: 'clean line art, cel shading, expressive eyes, detailed painted background, vibrant but controlled palette',
  },
  '3d': {
    label: '3D Animation',
    prompt: 'Stylized 3D animated render',
    finish: 'soft global illumination, subsurface skin shading, richly detailed textures, feature-animation quality',
  },
  storybook: {
    label: 'Storybook',
    prompt: 'Storybook illustration',
    finish: 'painterly watercolor and gouache textures, soft edges, warm hand-drawn feel',
  },
};

export const GENRES = {
  mystery: {
    label: 'Mystery / Suspense',
    mood: 'mysterious, suspenseful, quietly tense',
    lighting: 'low-key lighting, deep shadows, cool moonlight balanced with warm practical lamps',
    environment: 'drifting fog and gently flickering practical lights',
    music: 'low pulsing strings with sparse piano notes',
    pacing: 'slow and deliberate',
    transitions: ['Cut', 'Slow dissolve', 'Match cut', 'Cut'],
    ending: 'an unanswered question',
    tension: 'suspense',
    tensionAdj: 'suspenseful',
  },
  romance: {
    label: 'Romance',
    mood: 'tender, warm, intimate',
    lighting: 'golden-hour backlight with a soft diffused glow',
    environment: 'a soft breeze moving hair and fabric, floating bokeh',
    music: 'warm strings and gentle piano',
    pacing: 'gentle and flowing',
    transitions: ['Soft dissolve', 'Cross-fade', 'Cut', 'Match cut'],
    ending: 'an emotional resolution',
    tension: 'longing',
    tensionAdj: 'yearning',
  },
  adventure: {
    label: 'Adventure',
    mood: 'bold, energetic, awe-inspiring',
    lighting: 'dramatic natural light, strong sun rays, epic sky',
    environment: 'wind-blown dust, moving clouds and swaying foliage',
    music: 'rising orchestral percussion and brass',
    pacing: 'dynamic and propulsive',
    transitions: ['Cut', 'Whip pan', 'Match cut', 'Cross-fade'],
    ending: 'a glimpse of the road ahead',
    tension: 'momentum',
    tensionAdj: 'charged',
  },
  horror: {
    label: 'Horror',
    mood: 'ominous, dread-filled, unsettling',
    lighting: 'harsh contrast, sickly desaturated tones, a single flickering light source',
    environment: 'creeping shadows, flickering light and slow-drifting fog',
    music: 'dissonant drone with a sub-bass rumble',
    pacing: 'slow, then sudden',
    transitions: ['Hard cut', 'Flicker cut', 'Smash cut', 'Slow dissolve'],
    ending: 'a lingering threat',
    tension: 'dread',
    tensionAdj: 'dread-filled',
  },
  educational: {
    label: 'Educational',
    mood: 'clear, curious, friendly',
    lighting: 'bright, even, clean lighting',
    environment: 'subtle background motion and gently floating particles',
    music: 'light, upbeat underscore',
    pacing: 'clear and steady',
    transitions: ['Cut', 'Cross-fade', 'Slide', 'Cut'],
    ending: 'a clear recap of the key takeaway',
    tension: 'curiosity',
    tensionAdj: 'curious',
  },
};

export const ASPECTS = {
  '9:16': {
    label: 'Vertical 9:16',
    orientation: 'vertical',
    composition: 'vertical 9:16 frame, subject centered in the upper two-thirds, safe margins for captions and app UI',
  },
  '16:9': {
    label: 'Widescreen 16:9',
    orientation: 'widescreen',
    composition: 'horizontal 16:9 widescreen frame, rule-of-thirds composition with breathing room',
  },
};

export const DEFAULT_SETTINGS = {
  title: '',
  story: '',
  genre: 'mystery',
  style: 'cinematic',
  language: 'English',
  characterDescription: '',
  sceneCount: 6,
  duration: 60,
  aspectRatio: '9:16',
  includeAudio: true,
};

export class StoryValidationError extends Error {
  constructor(errors) {
    super(Object.values(errors)[0] || 'Invalid story input.');
    this.name = 'StoryValidationError';
    this.errors = errors;
  }
}

export function createId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') {
    try {
      return c.randomUUID();
    } catch {
      /* randomUUID needs a secure context in browsers — fall through */
    }
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/* ----------------------------- text helpers ----------------------------- */

const wordCount = (text) => (String(text).match(/[\p{L}\p{N}]+/gu) || []).length;
const capitalize = (text) => (text ? text.charAt(0).toUpperCase() + text.slice(1) : text);
const unique = (items) => [...new Set(items.filter(Boolean))];

function stripTerminal(text) {
  return String(text).replace(/[\s.!?…।,;:]+$/u, '').trim();
}

function shorten(text, max = 110) {
  const clean = stripTerminal(text);
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > 40 ? cut.slice(0, lastSpace) : cut).trim()}…`;
}

const quoteRef = (text) => `“${shorten(text)}”`;

function ensureSentence(text) {
  const clean = String(text).trim();
  if (!clean) return clean;
  return /[.!?…।"”]$/u.test(clean) ? clean : `${clean}.`;
}

export function normalizeWhitespace(text) {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/[\t\f\v\u00a0]+/g, ' ')
    .replace(/ {2,}/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const QUOTE_RE = /[“"]([^“”"]{1,500})[”"]/g;

/** Returns quoted lines found in the text (preserved verbatim). */
export function extractDialogue(text) {
  return Array.from(String(text).matchAll(QUOTE_RE), (m) => m[1].trim())
    .filter(Boolean)
    .map((line) => `“${line}”`);
}

/** Removes quoted dialogue, leaving the narration. */
export function stripDialogue(text) {
  return String(text)
    .replace(QUOTE_RE, ' ')
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/[\s,;:]+$/u, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

/* ------------------------- sentence segmentation ------------------------- */

const TERMINALS = new Set(['.', '!', '?', '…', '।']);
const CLOSERS = new Set(['"', '”', '’', "'", ')', ']']);
const ABBREVIATIONS = new Set(['mr', 'mrs', 'ms', 'dr', 'st', 'jr', 'sr', 'vs', 'prof', 'mt', 'fig']);

function wordBefore(chars, index) {
  let k = index - 1;
  let word = '';
  while (k >= 0 && /\p{L}/u.test(chars[k])) {
    word = chars[k] + word;
    k -= 1;
  }
  return word;
}

/**
 * Quote-aware sentence splitter. Keeps final fragments without punctuation,
 * does not split inside quotes, and skips common abbreviations / initials.
 */
export function splitSentences(paragraph) {
  const chars = Array.from(String(paragraph ?? ''));
  const out = [];
  let start = 0;
  let inQuote = false;
  let i = 0;

  const push = (from, to) => {
    const sentence = chars.slice(from, to).join('').trim();
    if (sentence && /[\p{L}\p{N}]/u.test(sentence)) out.push(sentence);
  };

  while (i < chars.length) {
    const ch = chars[i];
    if (ch === '“') inQuote = true;
    else if (ch === '”') inQuote = false;
    else if (ch === '"') inQuote = !inQuote;

    if (!TERMINALS.has(ch)) {
      i += 1;
      continue;
    }

    let j = i + 1;
    while (j < chars.length && TERMINALS.has(chars[j])) j += 1;
    while (j < chars.length && CLOSERS.has(chars[j])) {
      if (chars[j] === '”' || (chars[j] === '"' && inQuote)) inQuote = false;
      j += 1;
    }

    const atEnd = j >= chars.length;
    if (!inQuote && (atEnd || /\s/u.test(chars[j]))) {
      let k = j;
      while (k < chars.length && /\s/u.test(chars[k])) k += 1;
      const prev = wordBefore(chars, i);
      const isAbbrev =
        ch === '.' && (ABBREVIATIONS.has(prev.toLowerCase()) || (prev.length === 1 && /\p{Lu}/u.test(prev)));
      const nextIsLower = k < chars.length && /\p{Ll}/u.test(chars[k]);
      if (!isAbbrev && !nextIsLower) {
        push(start, j);
        start = k;
        i = k;
        continue;
      }
    }
    i = j;
  }
  push(start, chars.length);
  return out;
}

const CONNECTORS = '(?:and then|and|but|then|where|when|while|until|so)';
const CLAUSE_RE = new RegExp(`\\s*[,;:]\\s+(?:${CONNECTORS}\\s+)?|\\s+${CONNECTORS}\\s+`, 'giu');

/** Splits a long sentence into clauses — only where both sides have 3+ words. */
export function splitClauses(sentence) {
  if (/["“”]/.test(sentence)) return [sentence];
  const pieces = [];
  let last = 0;
  for (const match of sentence.matchAll(CLAUSE_RE)) {
    const left = sentence.slice(last, match.index).trim();
    const rest = sentence.slice(match.index + match[0].length).trim();
    if (wordCount(left) >= 3 && wordCount(rest) >= 3) {
      pieces.push(left);
      last = match.index + match[0].length;
    }
  }
  pieces.push(sentence.slice(last).trim());
  return pieces
    .filter(Boolean)
    .map((piece) => capitalize(piece.replace(/^[,;:\s]+/, '').replace(/[,;:\s]+$/, '')));
}

/** Extracts story beats. Splits clauses only when there are fewer beats than scenes. */
export function extractBeats(story, targetCount = 1) {
  const lines = normalizeWhitespace(story)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
  let beats = lines.flatMap((line) => splitSentences(line));

  while (beats.length < targetCount) {
    let bestIndex = -1;
    let bestPieces = null;
    beats.forEach((beat, index) => {
      const pieces = splitClauses(beat);
      if (pieces.length > 1 && (bestIndex === -1 || beat.length > beats[bestIndex].length)) {
        bestIndex = index;
        bestPieces = pieces;
      }
    });
    if (bestIndex === -1) break;
    beats = [...beats.slice(0, bestIndex), ...bestPieces, ...beats.slice(bestIndex + 1)];
  }
  return beats;
}

/* ------------------------------ validation ------------------------------ */

export function validateStoryInput(input = {}) {
  const errors = {};
  const story = normalizeWhitespace(typeof input.story === 'string' ? input.story : '');

  if (!story) errors.story = 'Please enter a story to generate a storyboard.';
  else if (!/[\p{L}\p{N}]/u.test(story)) errors.story = 'Your story needs some words, not just punctuation.';
  else if (story.length < LIMITS.storyMin) errors.story = `Story is too short — write at least ${LIMITS.storyMin} characters.`;
  else if (story.length > LIMITS.storyMax)
    errors.story = `Story is too long — keep it under ${LIMITS.storyMax.toLocaleString('en-US')} characters.`;

  if (input.title != null && String(input.title).trim().length > LIMITS.title)
    errors.title = `Title must be ${LIMITS.title} characters or fewer.`;
  if (input.characterDescription != null && String(input.characterDescription).length > LIMITS.character)
    errors.characterDescription = `Character description must be ${LIMITS.character.toLocaleString('en-US')} characters or fewer.`;
  if (!Object.hasOwn(STYLES, input.style ?? '')) errors.style = 'Choose a supported visual style.';
  if (!Object.hasOwn(GENRES, input.genre ?? '')) errors.genre = 'Choose a supported genre / mood.';
  if (!SCENE_COUNTS.includes(Number(input.sceneCount))) errors.sceneCount = `Scene count must be one of ${SCENE_COUNTS.join(', ')}.`;
  if (!DURATIONS.includes(Number(input.duration))) errors.duration = `Duration must be one of ${DURATIONS.join(', ')} seconds.`;
  if (!ASPECT_RATIOS.includes(input.aspectRatio)) errors.aspectRatio = 'Aspect ratio must be 9:16 or 16:9.';
  if (input.language != null && !LANGUAGES.includes(input.language)) errors.language = 'Choose a supported language.';
  return errors;
}

export function normalizeSettings(input = {}) {
  return {
    title: String(input.title ?? '').trim().slice(0, LIMITS.title),
    story: normalizeWhitespace(input.story),
    genre: input.genre,
    style: input.style,
    language: LANGUAGES.includes(input.language) ? input.language : 'English',
    characterDescription: normalizeWhitespace(input.characterDescription).slice(0, LIMITS.character),
    sceneCount: Number(input.sceneCount),
    duration: Number(input.duration),
    aspectRatio: input.aspectRatio,
    includeAudio: input.includeAudio !== false,
  };
}

/* ------------------------------- timing -------------------------------- */

/** Integer durations that sum exactly to `total`; extra seconds are spread evenly. */
export function distributeDuration(total, count) {
  const base = Math.floor(total / count);
  const remainder = total - base * count;
  const durations = new Array(count).fill(base);
  for (let k = 0; k < remainder; k += 1) {
    durations[Math.floor(((k + 0.5) * count) / remainder)] += 1;
  }
  return durations;
}

export function sumDurations(scenes) {
  return scenes.reduce((sum, scene) => sum + (Number(scene.duration) || 0), 0);
}

/** Re-numbers scenes and recomputes continuous start/end times. */
export function recalculateTimeline(scenes) {
  let t = 0;
  return scenes.map((scene, index) => {
    const duration = Math.min(
      MAX_SCENE_DURATION,
      Math.max(MIN_SCENE_DURATION, Math.round(Number(scene.duration) || MIN_SCENE_DURATION)),
    );
    const next = { ...scene, sceneNumber: index + 1, duration, startTime: t, endTime: t + duration };
    t += duration;
    return next;
  });
}

/**
 * Changes one scene's duration. With lockTotal, the difference is taken from /
 * given to the other scenes so the total never changes.
 */
export function adjustSceneDuration(scenes, sceneId, requested, { lockTotal = true } = {}) {
  const idx = scenes.findIndex((scene) => scene.id === sceneId);
  if (idx === -1) return scenes;
  let value = Math.round(Number(requested));
  if (!Number.isFinite(value)) return scenes;
  value = Math.min(MAX_SCENE_DURATION, Math.max(MIN_SCENE_DURATION, value));

  const n = scenes.length;
  const next = scenes.map((scene) => scene.duration);

  if (!lockTotal) {
    next[idx] = value;
    return recalculateTimeline(scenes.map((scene, i) => ({ ...scene, duration: next[i] })));
  }
  if (n === 1) return scenes;

  const total = sumDurations(scenes);
  value = Math.min(value, total - MIN_SCENE_DURATION * (n - 1));
  let delta = value - next[idx];
  next[idx] = value;

  const order = [];
  for (let k = 1; k < n; k += 1) order.push((idx + k) % n);

  while (delta > 0) {
    let best = -1;
    for (const j of order) if (next[j] > MIN_SCENE_DURATION && (best === -1 || next[j] > next[best])) best = j;
    if (best === -1) break;
    next[best] -= 1;
    delta -= 1;
  }
  while (delta < 0) {
    let best = -1;
    for (const j of order) if (next[j] < MAX_SCENE_DURATION && (best === -1 || next[j] < next[best])) best = j;
    if (best === -1) break;
    next[best] += 1;
    delta += 1;
  }
  return recalculateTimeline(scenes.map((scene, i) => ({ ...scene, duration: next[i] })));
}

/** Proportionally rescales durations to hit `target` exactly (largest-remainder method). */
export function rebalanceDurations(scenes, target) {
  const n = scenes.length;
  if (!n) return scenes;
  const total = Math.max(Math.round(target), n * MIN_SCENE_DURATION);
  const weights = scenes.map((scene) => Math.max(MIN_SCENE_DURATION, Number(scene.duration) || MIN_SCENE_DURATION));
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const raw = weights.map((w) => (w * total) / weightSum);
  const next = raw.map((r) => Math.max(MIN_SCENE_DURATION, Math.floor(r)));
  let diff = total - next.reduce((a, b) => a + b, 0);

  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  let k = 0;
  while (diff > 0) {
    next[order[k % n].i] += 1;
    diff -= 1;
    k += 1;
  }
  while (diff < 0) {
    let best = -1;
    for (let j = 0; j < n; j += 1) if (next[j] > MIN_SCENE_DURATION && (best === -1 || next[j] > next[best])) best = j;
    if (best === -1) break;
    next[best] -= 1;
    diff += 1;
  }
  return recalculateTimeline(scenes.map((scene, i) => ({ ...scene, duration: next[i] })));
}

/* ------------------------------ templates ------------------------------ */

const SHOTS = {
  establishing: { camera: 'Wide establishing shot — slow push-in', purpose: 'Sets geography and mood.', move: 'slow, steady push-in toward the subject', framing: 'wide establishing shot' },
  medium: { camera: 'Medium shot — gentle handheld drift', purpose: 'Keeps focus on action and body language.', move: 'gentle handheld drift', framing: 'medium shot' },
  closeup: { camera: 'Close-up — slow dolly-in', purpose: 'Emphasizes emotion.', move: 'slow dolly-in on the face and eyes', framing: 'close-up' },
  tracking: { camera: 'Tracking shot — smooth lateral follow', purpose: 'Carries movement through space.', move: 'smooth tracking shot following the subject', framing: 'medium-wide tracking shot' },
  ots: { camera: 'Over-the-shoulder — subtle parallax', purpose: 'Puts the viewer in the character’s point of view.', move: 'subtle over-the-shoulder parallax shift', framing: 'over-the-shoulder shot' },
  lowangle: { camera: 'Low-angle shot — slow tilt up', purpose: 'Makes the place or subject feel imposing.', move: 'slow tilt up revealing scale', framing: 'low-angle shot' },
  insert: { camera: 'Insert detail close-up — rack focus', purpose: 'Draws attention to a key object.', move: 'rack focus from a foreground detail to the subject', framing: 'extreme close-up detail shot' },
  orbit: { camera: 'Slow orbit — 90° arc around the subject', purpose: 'Adds depth and unease.', move: 'slow 90-degree orbit around the subject', framing: 'medium shot' },
  twoshot: { camera: 'Two-shot — near-static with a slight push', purpose: 'Frames the relationship between characters.', move: 'near-static frame with a subtle push-in', framing: 'two-shot' },
  highangle: { camera: 'High-angle wide — slow crane down', purpose: 'Shows consequence and vulnerability.', move: 'slow crane down from above', framing: 'high-angle wide shot' },
  finalpush: { camera: 'Slow push-in to close-up — hold on the last frame', purpose: 'Lands the ending.', move: 'very slow push-in, then hold on the final frame', framing: 'close-up' },
};

const STORY_SHOT_CYCLE = ['medium', 'tracking', 'ots', 'closeup', 'lowangle', 'orbit', 'insert', 'twoshot', 'highangle'];

const SHOT_KEYWORDS = [
  [/\b(letter|envelope|photo|photograph|portrait|key|handle|pendant|ring|map|note|book|screen|phone)s?\b/i, 'insert'],
  [/\b(says?|asks?|whispers?|tells?|replies|warns?|calls?|meets?)\b|["“]/i, 'twoshot'],
  [/\b(walks?|runs?|chases?|enters?|approach(es)?|follows?|rides?|drives?|climbs?|wanders?)\b/i, 'tracking'],
  [/\b(mansion|castle|tower|mountain|city|skyline|gates?|forest|ocean|palace|temple)\b/i, 'lowangle'],
];

const SFX_KEYWORDS = [
  [/\b(rain|rainy|drizzle|downpour)\b/i, 'rain patter'],
  [/\b(thunder|lightning|storm)\b/i, 'distant thunder'],
  [/\b(letter|envelope|paper|page|map|note|book|photograph|photo)s?\b/i, 'paper rustle'],
  [/\b(door|gate|hinge)s?\b/i, 'creaking hinges'],
  [/\b(slams?|slammed|bang)\b/i, 'door slam'],
  [/\b(footsteps?|walks?|walked|steps?|stairs|enters?|entered|runs?|ran)\b/i, 'footsteps'],
  [/\b(mansion|house|hall|foyer|corridor|castle|church)\b/i, 'echoing room tone'],
  [/\b(clock|midnight|ticking)\b/i, 'clock ticking'],
  [/\b(wind|windy|cliff|blizzard)\b/i, 'howling wind'],
  [/\b(forest|woods|jungle|trees)\b/i, 'rustling leaves and distant birds'],
  [/\b(sea|ocean|beach|waves|shore)\b/i, 'rolling waves'],
  [/\b(city|street|traffic|cars?)\b/i, 'distant traffic'],
  [/\b(fire|candle|fireplace|torch)\b/i, 'crackling flame'],
  [/\b(crowd|market|party|festival|classroom)\b/i, 'crowd murmur'],
  [/\b(heart|fear|afraid|panic|screams?)\b/i, 'heartbeat pulse'],
  [/\b(phone|message|notification)\b/i, 'phone vibration'],
  [/\b(sword|fight|battle|punch|gun|gunshot)\b/i, 'impact hits'],
  [/\b(piano|music|song|melody)\b/i, 'soft piano motif'],
  [/\b(whispers?|whispered)\b/i, 'close whisper'],
];

const ENV_KEYWORDS = [
  [/\b(rain|rainy|storm|drizzle)/i, 'rain streaks and drips catching the light'],
  [/\b(snow|blizzard|winter)/i, 'snowflakes drifting slowly'],
  [/\b(mansion|attic|dust|abandoned|ruins?)/i, 'dust motes drifting through shafts of light'],
  [/\b(candle|fire|torch|lantern)/i, 'flickering warm firelight'],
  [/\b(sea|ocean|beach|waves|shore)/i, 'waves rolling and sea mist drifting'],
  [/\b(forest|woods|jungle|trees)/i, 'leaves swaying and light dappling through branches'],
  [/\b(city|street|neon|traffic)/i, 'passing headlights and neon reflections'],
  [/\b(wind|cliff|desert|mountain)/i, 'wind moving hair, clothing and loose debris'],
  [/\b(night|moon|midnight)/i, 'clouds drifting across the moonlight'],
];

const DERIVED = {
  establishing: {
    label: 'Establishing',
    describe: [(p, n, g) => `Establishing beat — introduce the setting, light and ${g.tension} before ${quoteRef(n)}.`],
    visual: (p, n) => `the environment and atmosphere that set up ${quoteRef(n)}; characters small in frame or not yet visible`,
    action: 'ambient life in the environment only; no major character action yet',
    sfx: 'ambient atmosphere bed',
  },
  reaction: {
    label: 'Reaction',
    describe: [
      (p) => `Reaction beat — hold on the character’s emotional response to ${quoteRef(p)}.`,
      (p) => `Reaction beat — a quieter pause as the character absorbs ${quoteRef(p)}.`,
    ],
    visual: (p) => `the character’s emotional reaction just after ${quoteRef(p)}`,
    action: 'subtle facial reaction — eyes shift, breath catches, a small turn of the head',
    sfx: 'close breath and soft room tone',
  },
  discovery: {
    label: 'Discovery',
    describe: [
      (p) => `Discovery beat — reveal a visual detail connected to ${quoteRef(p)}.`,
      (p) => `Discovery beat — the character notices something new tied to ${quoteRef(p)}.`,
    ],
    visual: (p) => `a revealing close detail connected to ${quoteRef(p)}`,
    action: 'the character leans in as focus shifts to the revealed detail',
    sfx: 'soft musical sting on the reveal',
  },
  tension: {
    label: 'Build-up',
    describe: [
      (p, n, g) => `Build-up beat — heighten the ${g.tension} that follows ${quoteRef(p)}.`,
      (p, n, g) => `Build-up beat — slow the pacing and let the ${g.tension} grow after ${quoteRef(p)}.`,
    ],
    visual: (p, n, g) => `a suspended, ${g.tensionAdj} moment following ${quoteRef(p)}`,
    action: 'the character pauses and listens; slow, deliberate movement',
    sfx: 'rising low drone',
  },
  approach: {
    label: 'Lead-in',
    describe: [
      (p, n) => `Lead-in beat — the character moves toward the next moment: ${quoteRef(n)}.`,
      (p, n) => `Lead-in beat — bridge the action and build anticipation for ${quoteRef(n)}.`,
    ],
    visual: (p, n) => `the character moving toward ${quoteRef(n)}`,
    action: 'the character moves forward with purpose through the space',
    sfx: 'footsteps and shifting ambience',
  },
  consequence: {
    label: 'Consequence',
    describe: [
      (p) => `Consequence beat — show the immediate aftermath of ${quoteRef(p)}.`,
      (p) => `Consequence beat — the situation shifts because of ${quoteRef(p)}.`,
    ],
    visual: (p) => `the aftermath of ${quoteRef(p)}`,
    action: 'the character steps back, processing what just happened',
    sfx: 'low impact hit, then a lingering tone',
  },
  closing: {
    label: 'Closing',
    describe: [(p, n, g) => `Closing beat — a final lingering image that leaves ${g.ending}, echoing ${quoteRef(p)}.`],
    visual: (p, n, g) => `a final lingering image echoing ${quoteRef(p)}, leaving ${g.ending}`,
    action: 'minimal movement — a final glance or held stillness',
    sfx: 'music swell, then a beat of silence',
  },
};

const DERIVED_SHOT = {
  establishing: 'establishing',
  reaction: 'closeup',
  discovery: 'insert',
  tension: 'ots',
  approach: 'tracking',
  consequence: 'highangle',
  closing: 'finalpush',
};

const AFTER_CYCLE = ['reaction', 'consequence', 'discovery', 'tension'];
const MIDDLE_CYCLE = ['discovery', 'tension'];

function arcLabel(i, count) {
  if (i === 0) return 'Opening';
  if (i === count - 1) return 'Finale';
  const f = i / (count - 1);
  if (f < 0.34) return 'Setup';
  if (f < 0.67) return 'Rising Action';
  return 'Climax';
}

function pickStoryShot(text, storyIndex, prevShot) {
  const match = SHOT_KEYWORDS.find(([re]) => re.test(text));
  let key = match ? match[1] : STORY_SHOT_CYCLE[storyIndex % STORY_SHOT_CYCLE.length];
  let guard = 0;
  while (key === prevShot && guard < STORY_SHOT_CYCLE.length) {
    key = STORY_SHOT_CYCLE[(storyIndex + 1 + guard) % STORY_SHOT_CYCLE.length];
    guard += 1;
  }
  return key;
}

const keywordSfx = (text) => SFX_KEYWORDS.filter(([re]) => re.test(text)).map(([, sfx]) => sfx);
const keywordEnvironment = (text) => ENV_KEYWORDS.find(([re]) => re.test(text))?.[1] ?? null;

/** Maps beats onto scene slots. Fewer beats than scenes → labeled derived beats fill gaps. */
function planSlots(beats, count) {
  const n = beats.length;
  if (n >= count) {
    return Array.from({ length: count }, (_, i) => ({
      kind: 'story',
      texts: beats.slice(Math.floor((i * n) / count), Math.floor(((i + 1) * n) / count)),
    }));
  }

  const slots = new Array(count).fill(null);
  const bookends = count - n >= 2;
  const first = bookends ? 1 : 0;
  const span = (bookends ? count - 2 : count - 1) - first;
  beats.forEach((beat, i) => {
    const pos = n === 1 ? first : first + Math.round((i * span) / (n - 1));
    slots[pos] = { kind: 'story', texts: [beat] };
  });

  const storyPositions = slots.map((slot, i) => (slot ? i : -1)).filter((i) => i >= 0);
  for (let i = 0; i < count; i += 1) {
    if (slots[i]) continue;
    const prevPos = [...storyPositions].reverse().find((p) => p < i);
    const nextPos = storyPositions.find((p) => p > i);
    const prev = prevPos !== undefined ? slots[prevPos].texts[0] : null;
    const next = nextPos !== undefined ? slots[nextPos].texts[0] : null;
    let kind;
    if (prevPos === undefined) kind = 'establishing';
    else if (nextPos === undefined) {
      kind = i === count - 1 ? 'closing' : AFTER_CYCLE[(i - prevPos - 1) % AFTER_CYCLE.length];
    } else {
      const offset = i - prevPos;
      if (offset === 1) kind = 'reaction';
      else if (i === nextPos - 1) kind = 'approach';
      else kind = MIDDLE_CYCLE[(offset - 2) % MIDDLE_CYCLE.length];
    }
    slots[i] = { kind, prev, next };
  }
  return slots;
}

/* ------------------------------- generator ------------------------------ */

/**
 * Pure apart from IDs and the timestamp (both injectable for tests).
 * @returns {{ settings: object, scenes: object[], meta: object }}
 */
export function generateStoryboard(input, options = {}) {
  const idFactory = options.idFactory || createId;
  const now = options.now || new Date();

  const errors = validateStoryInput(input);
  if (Object.keys(errors).length) throw new StoryValidationError(errors);

  const settings = normalizeSettings(input);
  const genre = GENRES[settings.genre];
  const style = STYLES[settings.style];
  const aspect = ASPECTS[settings.aspectRatio];
  const count = settings.sceneCount;
  const beats = extractBeats(settings.story, count);
  const slots = planSlots(beats, count);
  const durations = distributeDuration(settings.duration, count);
  const character = settings.characterDescription.replace(/\s*\n+\s*/g, '; ');

  const variantUse = {};
  const usedDerived = new Set();
  let prevShot = null;
  let storyIndex = 0;

  const scenes = slots.map((slot, i) => {
    const isFirst = i === 0;
    const isLast = i === count - 1;
    const duration = durations[i];
    let description;
    let visual;
    let action;
    let title;
    let shotKey;
    let sfxBase;
    let dialogue = '';
    let voiceover = '';
    let contextText;

    if (slot.kind === 'story') {
      const text = slot.texts.join(' ');
      const narration = stripDialogue(text);
      description = text;
      visual = narration || text;
      action = `${shorten(narration || text, 160)} — natural, grounded motion`;
      title = `Scene ${i + 1} — ${arcLabel(i, count)}`;
      shotKey = isFirst ? 'establishing' : isLast ? 'finalpush' : pickStoryShot(text, storyIndex, prevShot);
      if (settings.includeAudio) {
        dialogue = extractDialogue(text).join('\n');
        voiceover = narration && wordCount(narration) >= 3 ? ensureSentence(narration) : '';
      }
      sfxBase = keywordSfx(text);
      contextText = text;
      storyIndex += 1;
    } else {
      const def = DERIVED[slot.kind];
      const used = variantUse[slot.kind] || 0;
      variantUse[slot.kind] = used + 1;
      const prev = slot.prev ? stripDialogue(slot.prev) || slot.prev : '';
      const next = slot.next ? stripDialogue(slot.next) || slot.next : '';
      const base = def.describe[used % def.describe.length](prev, next, genre);
      description = base;
      let k = 2;
      while (usedDerived.has(description)) {
        description = `${base} (variation ${k})`;
        k += 1;
      }
      usedDerived.add(description);
      visual = def.visual(prev, next, genre);
      action = def.action;
      title = `Scene ${i + 1} — ${def.label}`;
      shotKey = isLast ? 'finalpush' : DERIVED_SHOT[slot.kind];
      if (shotKey === prevShot) shotKey = 'medium';
      contextText = `${slot.prev || ''} ${slot.next || ''}`;
      sfxBase = [def.sfx, ...keywordSfx(contextText).slice(0, 1)];
    }

    const shot = SHOTS[shotKey];
    prevShot = shotKey;
    const environment = keywordEnvironment(contextText) || genre.environment;

    const imagePrompt = [
      `${style.prompt}, ${shot.framing}: ${ensureSentence(visual)}`,
      character ? `Characters (keep consistent): ${ensureSentence(character)}` : '',
      `Mood: ${genre.mood}.`,
      `Lighting: ${genre.lighting}.`,
      `Composition: ${aspect.composition}.`,
      `Style: ${style.finish}.`,
      `Aspect ratio ${settings.aspectRatio}. No text, captions or watermarks.`,
    ]
      .filter(Boolean)
      .join(' ');

    const animationPrompt = [
      `Animate this ${settings.aspectRatio} ${aspect.orientation} still for ${duration} seconds.`,
      `Subject action: ${action}.`,
      `Camera: ${shot.move}.`,
      `Environment: ${environment}.`,
      `Pacing: ${genre.pacing}.`,
      'Keep faces, hair and outfits consistent with the source image; no morphing, warping or added text.',
    ].join(' ');

    let soundEffects = '';
    if (settings.includeAudio) {
      const sfx = unique(sfxBase).slice(0, 3);
      const intensity = isFirst
        ? 'enters softly'
        : isLast
          ? 'resolves or cuts to silence'
          : i / (count - 1) > 0.6
            ? 'intensifies'
            : 'builds gently';
      soundEffects = `Music: ${genre.music} — ${intensity}. SFX: ${sfx.length ? sfx.join(', ') : 'ambient room tone'}.`;
    }

    const transition = isLast ? 'Fade to black' : genre.transitions[i % genre.transitions.length];

    return {
      id: idFactory(),
      sceneNumber: i + 1,
      title,
      description,
      startTime: 0,
      endTime: 0,
      duration,
      imagePrompt,
      animationPrompt,
      camera: `${shot.camera}. ${shot.purpose}`,
      dialogue,
      voiceover,
      soundEffects,
      transition,
      beatType: slot.kind,
      isDerived: slot.kind !== 'story',
    };
  });

  const storyScenes = scenes.filter((scene) => !scene.isDerived).length;
  return {
    settings,
    scenes: recalculateTimeline(scenes),
    meta: {
      engine: ENGINE_VERSION,
      sourceBeats: beats.length,
      storyScenes,
      derivedScenes: scenes.length - storyScenes,
      generatedAt: now.toISOString(),
    },
  };
}
