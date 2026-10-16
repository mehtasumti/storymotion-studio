import { describe, expect, it } from 'vitest';
import { generateStoryboard } from './storyEngine.js';
import { buildProject, parseProject, serializeProject } from './projectJson.js';
import { DEMO_PRESETS } from './demoPresets.js';

const detailed = DEMO_PRESETS.find((p) => p.id === 'detailed').settings;

const validScene = (overrides = {}) => ({
  id: 'a',
  title: 'Scene',
  description: 'Beat',
  duration: 5,
  imagePrompt: 'img',
  animationPrompt: 'anim',
  camera: '',
  dialogue: '',
  voiceover: '',
  soundEffects: '',
  transition: 'Cut',
  ...overrides,
});

const wrap = (scenes, extra = {}) =>
  JSON.stringify({ schemaVersion: 1, app: 'storymotion-studio', settings: detailed, scenes, ...extra });

describe('project JSON', () => {
  it('round-trips a generated storyboard exactly', () => {
    const board = generateStoryboard(detailed);
    const result = parseProject(serializeProject(buildProject(board)));
    expect(result.ok).toBe(true);
    expect(result.project.settings).toEqual(board.settings);
    expect(result.project.scenes).toEqual(board.scenes);
    expect(result.project.meta).toEqual(board.meta);
  });

  it('rejects malformed JSON and wrong shapes', () => {
    expect(parseProject('{not json').ok).toBe(false);
    expect(parseProject('[]').ok).toBe(false);
    expect(parseProject(JSON.stringify({ hello: 'world' })).ok).toBe(false);
    expect(parseProject(wrap([])).ok).toBe(false);
  });

  it('rejects scenes with missing or invalid fields', () => {
    expect(parseProject(wrap([{ title: 'x' }])).ok).toBe(false);
    expect(parseProject(wrap([validScene({ duration: 2.5 })])).ok).toBe(false);
    expect(parseProject(wrap([validScene({ imagePrompt: 42 })])).ok).toBe(false);
  });

  it('rejects projects from a newer schema version', () => {
    expect(parseProject(wrap([validScene()], { schemaVersion: 99 })).ok).toBe(false);
  });

  it('repairs duplicate IDs and recomputes tampered times', () => {
    const result = parseProject(
      wrap([validScene({ id: 'same', startTime: 99 }), validScene({ id: 'same', duration: 7, endTime: 1 })]),
    );
    expect(result.ok).toBe(true);
    const [a, b] = result.project.scenes;
    expect(a.id).not.toBe(b.id);
    expect([a.startTime, a.endTime, b.startTime, b.endTime]).toEqual([0, 5, 5, 12]);
  });
});
