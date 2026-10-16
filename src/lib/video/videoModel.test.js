import { describe, expect, it } from 'vitest';
import { generateStoryboard } from '../storyEngine.js';
import { DEMO_PRESETS } from '../demoPresets.js';
import {
  MOTION_KEYS,
  autoCaptionText,
  autoMotion,
  buildAudioSchedule,
  buildVideoPlan,
  captionPages,
  carryMediaByPosition,
  defaultVideoSettings,
  envelopeValueAt,
  frameAt,
  motionTransform,
  musicEnvelope,
  outputSize,
  referencedMediaIds,
  sanitizeVideoSettings,
  sourceRect,
  transitionKind,
  wrapWords,
} from './videoModel.js';

const detailed = DEMO_PRESETS.find((p) => p.id === 'detailed').settings;
const board = generateStoryboard(detailed); // 10 scenes, 60 s, 9:16, mystery
const charMeasure = (s) => s.length * 10;

describe('camera motion', () => {
  it('maps camera directions to animations', () => {
    expect(autoMotion('Wide establishing shot — slow push-in')).toBe('zoom-in');
    expect(autoMotion('Low-angle shot — slow tilt up')).toBe('tilt-up');
    expect(autoMotion('High-angle wide — slow crane down')).toBe('tilt-down');
    expect(autoMotion('Tracking shot — smooth lateral follow')).toBe('pan-right');
    expect(autoMotion('Slow orbit — 90° arc around the subject')).toBe('pan-left');
    expect(autoMotion('Medium shot — gentle handheld drift')).toBe('drift');
    expect(autoMotion('Slow pull back to reveal the room')).toBe('zoom-out');
    expect(autoMotion('')).toBe('drift');
  });

  it('gives every generated scene a valid animation', () => {
    const plan = buildVideoPlan(board.scenes, defaultVideoSettings());
    plan.segments.forEach((s) => expect(MOTION_KEYS).toContain(s.motion));
    expect(new Set(plan.segments.map((s) => s.motion)).size).toBeGreaterThan(2);
  });

  it('manual override wins over auto selection', () => {
    const video = defaultVideoSettings();
    video.scenes[board.scenes[0].id] = { motion: 'pan-left' };
    expect(buildVideoPlan(board.scenes, video).segments[0].motion).toBe('pan-left');
  });

  it('zoom/pan transforms move in the right direction', () => {
    expect(motionTransform('zoom-in', 1).zoom).toBeGreaterThan(motionTransform('zoom-in', 0).zoom);
    expect(motionTransform('zoom-out', 1).zoom).toBeLessThan(motionTransform('zoom-out', 0).zoom);
    expect(motionTransform('pan-right', 1).x).toBeGreaterThan(motionTransform('pan-right', 0).x);
    expect(motionTransform('tilt-up', 1).y).toBeLessThan(motionTransform('tilt-up', 0).y);
  });

  it('never reveals empty edges, even with a mismatched image shape', () => {
    for (const motion of MOTION_KEYS) {
      for (const p of [0, 0.5, 1]) {
        for (const [iw, ih] of [[1920, 1080], [768, 1344], [500, 500]]) {
          const r = sourceRect(iw, ih, 720, 1280, motionTransform(motion, p), 'strong');
          expect(r.sx).toBeGreaterThanOrEqual(-0.001);
          expect(r.sy).toBeGreaterThanOrEqual(-0.001);
          expect(r.sx + r.sw).toBeLessThanOrEqual(iw + 0.001);
          expect(r.sy + r.sh).toBeLessThanOrEqual(ih + 0.001);
          expect(r.sw / r.sh).toBeCloseTo(720 / 1280, 5);
        }
      }
    }
  });
});

describe('timeline and transitions', () => {
  const plan = buildVideoPlan(board.scenes, defaultVideoSettings());

  it('uses the exact storyboard scene durations', () => {
    expect(plan.total).toBe(60);
    plan.segments.forEach((seg, i) => {
      expect(seg.start).toBe(board.scenes[i].startTime);
      expect(seg.end).toBe(board.scenes[i].endTime);
    });
  });

  it('maps transition names', () => {
    expect(transitionKind('Cut')).toBe('cut');
    expect(transitionKind('Slow dissolve')).toBe('dissolve');
    expect(transitionKind('Cross-fade')).toBe('dissolve');
    expect(transitionKind('Fade to black')).toBe('fade-black');
    expect(transitionKind('Fade to white')).toBe('fade-white');
    expect(transitionKind('Whip pan')).toBe('cut');
  });

  it('shows the right scene in the middle of each scene', () => {
    plan.segments.forEach((seg) => {
      const f = frameAt(plan, (seg.start + seg.end) / 2);
      expect(f.layers[f.layers.length - 1].segment.sceneId).toBe(seg.sceneId);
      expect(f.layers).toHaveLength(1);
    });
  });

  it('cross-fades symmetrically around a dissolve cut point', () => {
    const i = plan.segments.findIndex((s, k) => s.transitionOut === 'dissolve' && plan.segments[k + 1]);
    expect(i).toBeGreaterThanOrEqual(0);
    const seg = plan.segments[i];
    const at = frameAt(plan, seg.end - 0.0001);
    expect(at.layers).toHaveLength(2);
    expect(at.layers[1].alpha).toBeCloseTo(0.5, 2);
    const after = frameAt(plan, seg.end + 0.0001);
    expect(after.layers[1].alpha).toBeCloseTo(0.5, 2);
    expect(frameAt(plan, seg.end + seg.transitionOutDuration).layers).toHaveLength(1);
  });

  it('fades the last scene out to black', () => {
    const last = plan.segments[plan.segments.length - 1];
    expect(last.transitionOut).toBe('fade-black');
    expect(frameAt(plan, 59.99).overlay.alpha).toBeGreaterThan(0.95);
    expect(frameAt(plan, 0.01).overlay.alpha).toBeGreaterThan(0.9); // fade in from black
    expect(frameAt(plan, 3).overlay).toBeNull();
  });
});

describe('captions', () => {
  it('uses dialogue first and keeps the story text', () => {
    const withDialogue = board.scenes.find((s) => s.dialogue.includes('Leave now'));
    expect(autoCaptionText(withDialogue, 'auto')).toContain('Leave now');
    expect(autoCaptionText(withDialogue, 'auto')).not.toMatch(/^“/);
    const plain = board.scenes.find((s) => !s.dialogue && s.voiceover);
    expect(autoCaptionText(plain, 'auto')).toBe(plain.voiceover);
    expect(autoCaptionText(plain, 'dialogue')).toBe('');
  });

  it('wraps and pages long captions within the scene time', () => {
    const text = 'In the dusty foyer, her footsteps echo beneath a shrouded chandelier while rain hammers the old windows.';
    expect(wrapWords(text, 300, charMeasure).every((l) => l.length * 10 <= 300 || !l.includes(' '))).toBe(true);
    const pages = captionPages(text, 24, 30, { maxWidth: 300, measure: charMeasure, maxLines: 2 });
    expect(pages.length).toBeGreaterThan(1);
    pages.forEach((p) => expect(p.lines.length).toBeLessThanOrEqual(2));
    expect(pages[0].start).toBeGreaterThanOrEqual(24);
    expect(pages[pages.length - 1].end).toBeLessThanOrEqual(30);
    for (let k = 1; k < pages.length; k += 1) expect(pages[k].start).toBeCloseTo(pages[k - 1].end, 6);
  });

  it('breaks caption pages at punctuation and keeps every word', () => {
    const text = "On a rain-soaked night, a sealed envelope with no return address arrives at Elena's door.";
    const measure = (s) => s.length * 18; // ~34 chars per line at 620 px
    const pages = captionPages(text, 0, 6, { maxWidth: 620, measure, maxLines: 2 });
    expect(pages.length).toBe(2);
    expect(pages[0].lines.join(' ')).toBe('On a rain-soaked night,');
    expect(pages.map((p) => p.lines.join(' ')).join(' ')).toBe(text);
    pages.forEach((p) => p.lines.forEach((l) => expect(measure(l)).toBeLessThanOrEqual(620)));
  });

  it('uses the fewest pages when a phrase break would need an extra page', () => {
    const text = "On a rain-soaked night, a sealed envelope with no return address arrives at Elena's door.";
    const measure = (s) => s.length * 20; // ~30 chars per line, like 720p vertical video
    const pages = captionPages(text, 0, 6, { maxWidth: 605, measure, maxLines: 2 });
    expect(pages.length).toBe(2);
    expect(pages.map((p) => p.lines.join(' ')).join(' ')).toBe(text);
  });
});

describe('audio schedule', () => {
  const video = defaultVideoSettings();
  const [s0, s1] = board.scenes;
  video.scenes[s0.id] = { narration: { id: 'n0', name: 'n0.wav', duration: 2.5, volume: 1, offset: 0 } };
  video.scenes[s1.id] = { dialogue: { id: 'd1', name: 'd1.wav', duration: 30, volume: 0.8, offset: 1 } };
  video.music = { id: 'm', name: 'music.mp3', duration: 25, volume: 1, offset: 0, loop: true };
  const schedule = buildAudioSchedule(board.scenes, video);

  it('starts voice clips exactly at their scene start (+ offset)', () => {
    const n = schedule.items.find((x) => x.id === 'n0');
    expect(n.when).toBe(s0.startTime);
    expect(n.duration).toBe(2.5);
    const d = schedule.items.find((x) => x.id === 'd1');
    expect(d.when).toBe(s1.startTime + 1);
    expect(d.when + d.duration).toBe(s1.endTime); // trimmed at scene end
    expect(d.gain).toBeCloseTo(0.8);
  });

  it('loops music to cover exactly the whole video', () => {
    const pieces = schedule.items.filter((x) => x.lane === 'music');
    expect(pieces.length).toBe(3);
    expect(pieces.reduce((s, p) => s + p.duration, 0)).toBeCloseTo(60, 6);
    expect(pieces[pieces.length - 1].when + pieces[pieces.length - 1].duration).toBeCloseTo(60, 6);
  });

  it('ducks music under voices and fades in/out', () => {
    const env = musicEnvelope(schedule, { ducking: true });
    expect(envelopeValueAt(env, 0)).toBe(0);
    expect(envelopeValueAt(env, 60)).toBe(0);
    expect(envelopeValueAt(env, s1.startTime + 2)).toBeCloseTo(0.35, 2);
    expect(envelopeValueAt(env, 20)).toBeCloseTo(1, 2);
    const flat = musicEnvelope(schedule, { ducking: false });
    expect(envelopeValueAt(flat, s1.startTime + 2)).toBeCloseTo(1, 2);
  });
});

describe('settings', () => {
  it('sanitizes junk without throwing', () => {
    const s = sanitizeVideoSettings({ scenes: { 'bad id!': {}, ok: { motion: 'spin', imageId: '../x' } }, captions: { size: 'huge' } });
    expect(Object.keys(s.scenes)).toEqual(['ok']);
    expect(s.scenes.ok.motion).toBe('auto');
    expect(s.scenes.ok.imageId).toBeNull();
    expect(s.captions.size).toBe('medium');
    expect(sanitizeVideoSettings('nope')).toEqual(defaultVideoSettings());
  });

  it('carries media by position after regeneration and lists references', () => {
    const video = defaultVideoSettings();
    video.scenes[board.scenes[2].id] = { imageId: 'img2', caption: 'custom' };
    video.music = { id: 'mus' };
    const regenerated = generateStoryboard(detailed);
    const carried = carryMediaByPosition(video, board.scenes, regenerated.scenes);
    expect(carried.scenes[regenerated.scenes[2].id].imageId).toBe('img2');
    expect(carried.scenes[regenerated.scenes[2].id].caption).toBeNull();
    expect([...referencedMediaIds(carried)].sort()).toEqual(['img2', 'mus']);
  });

  it('computes even output sizes for both aspect ratios', () => {
    expect(outputSize('9:16', '720p')).toEqual({ width: 720, height: 1280 });
    expect(outputSize('16:9', '1080p')).toEqual({ width: 1920, height: 1080 });
  });
});
