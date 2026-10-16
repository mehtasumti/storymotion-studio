import {
  ASPECT_RATIOS, DEFAULT_SETTINGS, DURATIONS, GENRES, LANGUAGES, LIMITS,
  MAX_SCENE_DURATION, MIN_SCENE_DURATION, SCENE_COUNTS, STYLES, createId, recalculateTimeline,
} from './storyEngine.js';

export const SCHEMA_VERSION = 1;
export const APP_ID = 'storymotion-studio';
export const MAX_IMPORT_BYTES = 2_000_000;
export const MAX_SCENES = 30;
export const MAX_FIELD_LENGTH = 20000;
export const SCENE_TEXT_FIELDS = [
  'title', 'description', 'imagePrompt', 'animationPrompt', 'camera',
  'dialogue', 'voiceover', 'soundEffects', 'transition',
];
const REQUIRED_SCENE_FIELDS = ['imagePrompt', 'animationPrompt'];

const str = (value) => (typeof value === 'string' ? value : '');
const fail = (error) => ({ ok: false, error });

/** Lenient: unknown/invalid options fall back to defaults. */
export function sanitizeSettings(raw) {
  const s = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    title: str(s.title).slice(0, LIMITS.title),
    story: str(s.story).slice(0, LIMITS.storyMax),
    genre: Object.hasOwn(GENRES, s.genre ?? '') ? s.genre : DEFAULT_SETTINGS.genre,
    style: Object.hasOwn(STYLES, s.style ?? '') ? s.style : DEFAULT_SETTINGS.style,
    language: LANGUAGES.includes(s.language) ? s.language : DEFAULT_SETTINGS.language,
    characterDescription: str(s.characterDescription).slice(0, LIMITS.character),
    sceneCount: SCENE_COUNTS.includes(Number(s.sceneCount)) ? Number(s.sceneCount) : DEFAULT_SETTINGS.sceneCount,
    duration: DURATIONS.includes(Number(s.duration)) ? Number(s.duration) : DEFAULT_SETTINGS.duration,
    aspectRatio: ASPECT_RATIOS.includes(s.aspectRatio) ? s.aspectRatio : DEFAULT_SETTINGS.aspectRatio,
    includeAudio: typeof s.includeAudio === 'boolean' ? s.includeAudio : DEFAULT_SETTINGS.includeAudio,
  };
}

/** Strict: throws a readable Error for malformed scenes. */
export function validateScenes(raw) {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('The project contains no scenes.');
  if (raw.length > MAX_SCENES) throw new Error(`Too many scenes (maximum ${MAX_SCENES}).`);
  const seen = new Set();
  const scenes = raw.map((scene, i) => {
    const n = i + 1;
    if (!scene || typeof scene !== 'object' || Array.isArray(scene)) throw new Error(`Scene ${n} is not a valid object.`);
    for (const field of REQUIRED_SCENE_FIELDS) {
      if (typeof scene[field] !== 'string') throw new Error(`Scene ${n} is missing its "${field}".`);
    }
    for (const field of SCENE_TEXT_FIELDS) {
      if (scene[field] != null && typeof scene[field] !== 'string') throw new Error(`Scene ${n}: "${field}" must be text.`);
    }
    const duration = Number(scene.duration);
    if (!Number.isInteger(duration) || duration < MIN_SCENE_DURATION || duration > MAX_SCENE_DURATION) {
      throw new Error(`Scene ${n}: duration must be a whole number between ${MIN_SCENE_DURATION} and ${MAX_SCENE_DURATION} seconds.`);
    }
    let id = typeof scene.id === 'string' && scene.id.trim() && scene.id.length <= 100 ? scene.id : createId();
    if (seen.has(id)) id = createId();
    seen.add(id);

    const clean = {
      id,
      sceneNumber: n,
      startTime: 0,
      endTime: 0,
      duration,
      beatType: typeof scene.beatType === 'string' && scene.beatType.length <= 30 ? scene.beatType : 'story',
      isDerived: scene.isDerived === true,
    };
    for (const field of SCENE_TEXT_FIELDS) clean[field] = str(scene[field]).slice(0, MAX_FIELD_LENGTH);
    if (!clean.title.trim()) clean.title = `Scene ${n}`;
    return clean;
  });
  return recalculateTimeline(scenes);
}

function sanitizeMeta(meta) {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;
  const count = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
  return {
    engine: typeof meta.engine === 'string' ? meta.engine.slice(0, 60) : 'unknown',
    sourceBeats: count(meta.sourceBeats),
    storyScenes: count(meta.storyScenes),
    derivedScenes: count(meta.derivedScenes),
    generatedAt: typeof meta.generatedAt === 'string' ? meta.generatedAt.slice(0, 40) : null,
  };
}

export function validateProjectData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fail('This JSON does not contain a StoryMotion project.');
  if (typeof data.schemaVersion !== 'number') return fail('Missing schemaVersion — this does not look like a StoryMotion Studio project.');
  if (data.schemaVersion > SCHEMA_VERSION) return fail('This project was saved by a newer version of StoryMotion Studio.');
  if (!data.settings || typeof data.settings !== 'object' || Array.isArray(data.settings)) return fail('Project settings are missing.');
  let scenes;
  try {
    scenes = validateScenes(data.scenes);
  } catch (err) {
    return fail(err.message);
  }
  return {
    ok: true,
    project: {
      schemaVersion: SCHEMA_VERSION,
      settings: sanitizeSettings(data.settings),
      scenes,
      meta: sanitizeMeta(data.meta),
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
    },
  };
}

export function parseProject(text) {
  if (typeof text !== 'string') return fail('The file could not be read as text.');
  if (text.length > MAX_IMPORT_BYTES) return fail('The file is too large (maximum 2 MB).');
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return fail('This file is not valid JSON.');
  }
  return validateProjectData(data);
}

export function buildProject({ settings, scenes, meta }) {
  return { schemaVersion: SCHEMA_VERSION, app: APP_ID, settings, scenes, meta: meta ?? null, updatedAt: new Date().toISOString() };
}

export function serializeProject(project) {
  return JSON.stringify(project, null, 2);
}

export function projectFileName(title, ext) {
  const slug =
    String(title || 'storyboard')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'storyboard';
  return `${slug}-storymotion.${ext}`;
}

export function downloadText(filename, text, mime = 'application/json') {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
