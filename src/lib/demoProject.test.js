import { describe, expect, it } from 'vitest';
import { DEMO_IMAGES, DEMO_SETTINGS, attachDemoImages, buildDemoBoard } from './demoProject.js';
import { sumDurations } from './storyEngine.js';
import { validateProjectData } from './projectJson.js';
import { referencedMediaIds } from './video/videoModel.js';

const okFetch = async () => ({ ok: true, blob: async () => new Blob(['x'.repeat(2000)], { type: 'image/webp' }) });
let n = 0;
const fakeImport = async (blob, { name }) => ({ id: `m-test-${(n += 1)}`, width: 720, height: 1280, name });

describe('demo project', () => {
  it('generates a 6-scene, 30-second storyboard from real story beats', () => {
    const board = buildDemoBoard();
    expect(board.scenes).toHaveLength(6);
    expect(sumDurations(board.scenes)).toBe(30);
    expect(board.scenes.every((s) => !s.isDerived)).toBe(true);
    expect(board.settings.aspectRatio).toBe('9:16');
    expect(DEMO_IMAGES).toHaveLength(DEMO_SETTINGS.sceneCount);
  });

  it('attaches one stored image per scene and stays a valid project', async () => {
    const { board, attached, failed } = await attachDemoImages(buildDemoBoard(), { importImage: fakeImport, fetchImpl: okFetch });
    expect(attached).toBe(6);
    expect(failed).toBe(0);
    expect(referencedMediaIds(board.video).size).toBe(6);
    for (const scene of board.scenes) {
      expect(board.video.scenes[scene.id].imageWidth).toBe(720);
      expect(board.video.scenes[scene.id].motion).toBe('auto');
    }
    const check = validateProjectData({ schemaVersion: 2, settings: board.settings, scenes: board.scenes, meta: board.meta, video: board.video });
    expect(check.ok).toBe(true);
    expect(Object.keys(check.project.video.scenes)).toHaveLength(6);
  });

  it('keeps going when some images fail to download', async () => {
    let call = 0;
    const flaky = async () => ((call += 1) % 2 ? { ok: false, status: 404 } : okFetch());
    const { board, attached, failed } = await attachDemoImages(buildDemoBoard(), { importImage: fakeImport, fetchImpl: flaky });
    expect(attached).toBe(3);
    expect(failed).toBe(3);
    expect(board.scenes).toHaveLength(6);
  });
});
