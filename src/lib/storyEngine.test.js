import { describe, expect, it } from 'vitest';
import {
  DURATIONS, SCENE_COUNTS, StoryValidationError, adjustSceneDuration, distributeDuration,
  generateStoryboard, rebalanceDurations, splitSentences, sumDurations, validateStoryInput,
} from './storyEngine.js';
import { DEMO_CHARACTERS, DEMO_PRESETS } from './demoPresets.js';
import { formatTime, pdfSafe } from './format.js';

const ACCEPTANCE = {
  title: 'The Letter That Remembered',
  story: 'A young woman discovers a mysterious letter and enters an abandoned mansion, where a stranger knows her past.',
  genre: 'mystery',
  style: 'cinematic',
  language: 'English',
  sceneCount: 10,
  duration: 60,
  aspectRatio: '9:16',
  includeAudio: true,
  characterDescription: DEMO_CHARACTERS,
};

function expectContinuous(scenes, total) {
  expect(sumDurations(scenes)).toBe(total);
  let t = 0;
  scenes.forEach((scene, i) => {
    expect(Number.isInteger(scene.duration)).toBe(true);
    expect(scene.duration).toBeGreaterThanOrEqual(1);
    expect(scene.sceneNumber).toBe(i + 1);
    expect(scene.startTime).toBe(t);
    expect(scene.endTime).toBe(t + scene.duration);
    t = scene.endTime;
  });
  expect(t).toBe(total);
}

describe('generateStoryboard — acceptance test', () => {
  const { scenes } = generateStoryboard(ACCEPTANCE);

  it('creates ten scenes totalling exactly 60 seconds with continuous times', () => {
    expect(scenes).toHaveLength(10);
    expectContinuous(scenes, 60);
  });

  it('includes cinematic style, 9:16 and character consistency in prompts', () => {
    scenes.forEach((scene) => {
      expect(scene.imagePrompt.toLowerCase()).toContain('cinematic');
      expect(scene.imagePrompt).toContain('9:16');
      expect(scene.animationPrompt).toContain('9:16');
      expect(scene.imagePrompt).toContain('Elena');
    });
  });

  it('does not invent dialogue when the story has no quotes', () => {
    scenes.forEach((scene) => expect(scene.dialogue).toBe(''));
  });

  it('labels derived beats and never repeats an identical description', () => {
    expect(scenes.some((s) => s.isDerived)).toBe(true);
    expect(scenes.some((s) => !s.isDerived)).toBe(true);
    expect(new Set(scenes.map((s) => s.description)).size).toBe(scenes.length);
  });
});

describe('generateStoryboard — general behaviour', () => {
  it('sums exactly for every scene-count / duration combination', () => {
    for (const sceneCount of SCENE_COUNTS) {
      for (const duration of DURATIONS) {
        const { scenes } = generateStoryboard({ ...ACCEPTANCE, sceneCount, duration });
        expect(scenes).toHaveLength(sceneCount);
        expectContinuous(scenes, duration);
      }
    }
  });

  it('keeps a final fragment without punctuation', () => {
    const { scenes } = generateStoryboard({
      ...ACCEPTANCE,
      story: 'The ship leaves at dawn. The crew waits in silence',
      sceneCount: 4,
    });
    expect(scenes.some((s) => s.description.includes('The crew waits in silence'))).toBe(true);
  });

  it('preserves quoted dialogue from the story', () => {
    const detailed = DEMO_PRESETS.find((p) => p.id === 'detailed').settings;
    const { scenes } = generateStoryboard(detailed);
    expect(scenes).toHaveLength(10);
    expect(scenes.every((s) => !s.isDerived)).toBe(true);
    expect(scenes.some((s) => s.dialogue.includes('Leave now'))).toBe(true);
  });

  it('is deterministic apart from IDs and timestamp', () => {
    const run = () => {
      let n = 0;
      return generateStoryboard(ACCEPTANCE, { idFactory: () => `id-${(n += 1)}`, now: new Date(0) });
    };
    expect(run()).toEqual(run());
  });

  it('rejects an empty story', () => {
    expect(() => generateStoryboard({ ...ACCEPTANCE, story: '   ' })).toThrow(StoryValidationError);
    expect(validateStoryInput({ ...ACCEPTANCE, story: '' }).story).toBeTruthy();
  });

  it('rejects unsupported options', () => {
    const errors = validateStoryInput({ ...ACCEPTANCE, sceneCount: 7, duration: 45, aspectRatio: '1:1' });
    expect(errors.sceneCount).toBeTruthy();
    expect(errors.duration).toBeTruthy();
    expect(errors.aspectRatio).toBeTruthy();
  });
});

describe('splitSentences', () => {
  it('respects quotes and abbreviations', () => {
    expect(splitSentences('Dr. Rao opens the door. "Wait. Listen," she says. Silence')).toEqual([
      'Dr. Rao opens the door.',
      '"Wait. Listen," she says.',
      'Silence',
    ]);
  });
});

describe('duration tools', () => {
  it('distributes integer seconds that sum exactly', () => {
    const d = distributeDuration(60, 8);
    expect(d.reduce((a, b) => a + b, 0)).toBe(60);
    d.forEach((x) => expect(Number.isInteger(x)).toBe(true));
  });

  it('keeps the total fixed when locked', () => {
    const { scenes } = generateStoryboard(ACCEPTANCE);
    const next = adjustSceneDuration(scenes, scenes[0].id, 10, { lockTotal: true });
    expect(next[0].duration).toBe(10);
    expectContinuous(next, 60);
  });

  it('clamps impossible requests when locked', () => {
    const { scenes } = generateStoryboard(ACCEPTANCE);
    const next = adjustSceneDuration(scenes, scenes[3].id, 500, { lockTotal: true });
    expect(next[3].duration).toBe(60 - 9);
    expectContinuous(next, 60);
  });

  it('lets the total drift when unlocked, and rebalance restores it', () => {
    const { scenes } = generateStoryboard(ACCEPTANCE);
    const drifted = adjustSceneDuration(scenes, scenes[2].id, 9, { lockTotal: false });
    expectContinuous(drifted, 63);
    expectContinuous(rebalanceDurations(drifted, 60), 60);
  });
});

describe('format helpers', () => {
  it('formats times', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(60)).toBe('01:00');
    expect(formatTime(95)).toBe('01:35');
  });

  it('makes PDF text safe and flags unsupported characters', () => {
    expect(pdfSafe('“Hi” — ok…')).toEqual({ text: '"Hi" - ok...', replaced: false });
    expect(pdfSafe('नमस्ते').replaced).toBe(true);
  });
});
