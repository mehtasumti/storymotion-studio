import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Captions, Film, ImagePlus, Info, Music, Sparkles } from 'lucide-react';
import SceneMediaRow from './SceneMediaRow.jsx';
import VideoPreview from './VideoPreview.jsx';
import ExportPanel from './ExportPanel.jsx';
import AudioPanel from './AudioPanel.jsx';
import CaptionPanel from './CaptionPanel.jsx';
import AiImagePanel from './AiImagePanel.jsx';
import { AnnounceContext } from '../CopyButton.jsx';
import { aiImageSize, defaultVideoSettings, getSceneMedia } from '../../lib/video/videoModel.js';
import { IMAGE_ACCEPT, forgetMedia, importAudio, importImage } from '../../lib/video/mediaFiles.js';
import { deleteMedia } from '../../lib/video/mediaStore.js';
import {
  AI_PROVIDER,
  forgetAiData,
  generateImage,
  loadAiPrefs,
  loadSavedKey,
  saveAiPrefs,
  saveKey,
  seedFor,
} from '../../lib/video/aiImages.js';

const IMAGE_FIELDS = ['imageId', 'imageName', 'imageSource', 'imageWidth', 'imageHeight'];
const TABS = [
  { id: 'scenes', label: 'Scenes & images', icon: ImagePlus },
  { id: 'audio', label: 'Music & audio', icon: Music },
  { id: 'captions', label: 'Captions & motion', icon: Captions },
  { id: 'ai', label: 'AI images', icon: Sparkles },
];

export async function discardMedia(id) {
  if (!id) return;
  forgetMedia(id);
  try {
    await deleteMedia(id);
  } catch {
    /* an orphaned blob is cleaned up on next start */
  }
}

const errorMessage = (err, fallback) => (err?.message && err.name !== 'TypeError' ? err.message : fallback);

function initialAi() {
  const prefs = loadAiPrefs();
  const saved = loadSavedKey();
  return { ...prefs, key: saved, remember: !!saved };
}

/**
 * Video maker: turns the storyboard into an animated still-image video.
 * The parent stores `board.video` (references only); media lives in IndexedDB.
 */
export default function VideoStudio({ board, onVideoChange }) {
  const announce = useContext(AnnounceContext);
  const { scenes, settings } = board;
  const video = board.video ?? defaultVideoSettings();
  const videoRef = useRef(video);
  videoRef.current = video;

  const [tab, setTab] = useState('scenes');
  const [busy, setBusy] = useState({});
  const [errors, setErrors] = useState({});
  const [ai, setAi] = useState(initialAi);
  const [batch, setBatch] = useState(null);
  const attempts = useRef({});
  const batchAbort = useRef(null);
  const bulkRef = useRef(null);
  const seekRef = useRef(null);

  useEffect(() => () => batchAbort.current?.abort(), []);

  const setSceneBusy = (sceneId, key, value) => setBusy((prev) => ({ ...prev, [sceneId]: { ...prev[sceneId], [key]: value } }));
  const setSceneError = (sceneId, value) => setErrors((prev) => ({ ...prev, [sceneId]: value }));

  const patchScene = useCallback(
    (sceneId, patch) => onVideoChange((v) => ({ ...v, scenes: { ...v.scenes, [sceneId]: { ...getSceneMedia(v, sceneId), ...patch } } })),
    [onVideoChange],
  );

  /* ------------------------------ images ------------------------------ */

  const placeImage = useCallback(
    async (sceneId, file, source = 'upload') => {
      setSceneBusy(sceneId, 'image', source === 'ai' ? 'generating' : 'uploading');
      setSceneError(sceneId, null);
      try {
        const img = await importImage(file, { source, name: source === 'ai' ? `ai-scene-image.jpg` : file.name });
        const previous = getSceneMedia(videoRef.current, sceneId).imageId;
        patchScene(sceneId, { imageId: img.id, imageName: img.name, imageSource: source, imageWidth: img.width, imageHeight: img.height });
        if (previous && previous !== img.id) discardMedia(previous);
        return true;
      } catch (err) {
        const message = errorMessage(err, 'Could not add this image. Please try another file.');
        setSceneError(sceneId, { message });
        if (source !== 'ai') announce(message, 'error');
        return false;
      } finally {
        setSceneBusy(sceneId, 'image', null);
      }
    },
    [patchScene, announce],
  );

  async function handleBulk(files) {
    const list = files.filter((f) => f.type.startsWith('image/')).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    if (!list.length) {
      announce('No image files were selected.', 'error');
      return;
    }
    const empty = scenes.filter((s) => !getSceneMedia(videoRef.current, s.id).imageId);
    const slots = empty.length ? empty : scenes;
    const pairs = list.slice(0, slots.length).map((file, i) => [slots[i], file]);
    let ok = 0;
    for (const [scene, file] of pairs) {
      // Sequential keeps memory use low on phones.
      // eslint-disable-next-line no-await-in-loop
      if (await placeImage(scene.id, file)) ok += 1;
    }
    const skipped = list.length - pairs.length;
    announce(
      `Added ${ok} image${ok === 1 ? '' : 's'}${empty.length ? ' to scenes without one' : ''}.${skipped ? ` ${skipped} extra file${skipped === 1 ? ' was' : 's were'} not used.` : ''}`,
      ok ? 'success' : 'error',
    );
  }

  function removeImage(sceneId) {
    const old = getSceneMedia(videoRef.current, sceneId).imageId;
    patchScene(sceneId, { imageId: null, imageName: '', imageSource: null, imageWidth: 0, imageHeight: 0 });
    setSceneError(sceneId, null);
    discardMedia(old);
  }

  function moveImage(index, dir) {
    const a = scenes[index];
    const b = scenes[index + dir];
    if (!a || !b) return;
    onVideoChange((v) => {
      const ma = getSceneMedia(v, a.id);
      const mb = getSceneMedia(v, b.id);
      const pick = (m) => Object.fromEntries(IMAGE_FIELDS.map((k) => [k, m[k]]));
      return { ...v, scenes: { ...v.scenes, [a.id]: { ...ma, ...pick(mb) }, [b.id]: { ...mb, ...pick(ma) } } };
    });
    announce(`Swapped the images of scenes ${a.sceneNumber} and ${b.sceneNumber}.`);
  }

  /* --------------------------- voice clips --------------------------- */

  async function voiceFile(sceneId, lane, file) {
    setSceneBusy(sceneId, lane, true);
    try {
      const clip = await importAudio(file, { kind: lane });
      const old = getSceneMedia(videoRef.current, sceneId)[lane]?.id;
      patchScene(sceneId, { [lane]: { ...clip, volume: 1, offset: 0, stopAtSceneEnd: true } });
      discardMedia(old);
      announce(`${lane === 'narration' ? 'Narration' : 'Dialogue'} added (${clip.duration.toFixed(1)}s).`, 'success');
    } catch (err) {
      announce(errorMessage(err, 'Could not add this audio file.'), 'error');
    } finally {
      setSceneBusy(sceneId, lane, false);
    }
  }

  function clipChange(sceneId, lane, patch) {
    const current = getSceneMedia(videoRef.current, sceneId)[lane];
    if (current) patchScene(sceneId, { [lane]: { ...current, ...patch } });
  }

  function clipRemove(sceneId, lane) {
    const old = getSceneMedia(videoRef.current, sceneId)[lane]?.id;
    patchScene(sceneId, { [lane]: null });
    discardMedia(old);
  }

  /* ---------------------------- AI images ---------------------------- */

  const updateAi = (patch) =>
    setAi((prev) => {
      const next = { ...prev, ...patch };
      saveAiPrefs(next);
      if ('key' in patch || 'remember' in patch) saveKey(next.key, next.remember);
      return next;
    });

  async function generateForScene(sceneId, { signal } = {}) {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return { ok: false };
    const attempt = (attempts.current[sceneId] = (attempts.current[sceneId] ?? -1) + 1);
    const { width, height } = aiImageSize(settings.aspectRatio);
    setSceneBusy(sceneId, 'image', 'generating');
    setSceneError(sceneId, null);
    try {
      const blob = await generateImage(scene.imagePrompt, {
        key: ai.key,
        model: ai.model || undefined,
        width,
        height,
        seed: seedFor(`${scene.id}|${scene.imagePrompt}`, attempt),
        signal,
      });
      const ok = await placeImage(sceneId, blob, 'ai');
      return { ok };
    } catch (err) {
      const message = err?.message || 'Image generation failed.';
      setSceneError(sceneId, {
        message: `${message}`,
        retry: err?.code === 'nokey' || err?.code === 'auth' ? null : () => generateForScene(sceneId),
      });
      setSceneBusy(sceneId, 'image', null);
      return { ok: false, error: err };
    }
  }

  async function runBatch(targetIds) {
    if (!targetIds.length) return;
    batchAbort.current?.abort();
    const controller = new AbortController();
    batchAbort.current = controller;
    const state = { running: true, total: targetIds.length, done: 0, ok: 0, failed: 0, stoppedReason: '' };
    setBatch({ ...state });
    for (const id of targetIds) {
      if (controller.signal.aborted) {
        state.stoppedReason = 'you stopped it';
        break;
      }
      // eslint-disable-next-line no-await-in-loop
      const res = await generateForScene(id, { signal: controller.signal });
      state.done += 1;
      if (res.ok) state.ok += 1;
      else state.failed += 1;
      setBatch({ ...state });
      if (res.error?.fatal) {
        state.stoppedReason = res.error.message;
        break;
      }
      if (res.error?.code === 'rate' && res.error.retryAfter) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, Math.min(30, res.error.retryAfter) * 1000));
      }
    }
    state.running = false;
    setBatch({ ...state });
    announce(
      `AI images: ${state.ok} created${state.failed ? `, ${state.failed} failed` : ''}.${state.stoppedReason ? ` Stopped: ${state.stoppedReason}` : ''}`,
      state.failed ? 'warning' : 'success',
    );
  }

  const missingIds = useMemo(() => scenes.filter((s) => !getSceneMedia(video, s.id).imageId).map((s) => s.id), [scenes, video]);
  const imageCount = scenes.length - missingIds.length;

  return (
    <div className="video-studio">
      <div className="notice notice-info">
        <Film size={18} aria-hidden="true" />
        <p>
          <strong>Animated still-image video, made in your browser.</strong> Each scene shows one picture with a camera
          move (zoom, pan, tilt or drift), plus transitions, captions and your audio. Characters and objects do not move
          on their own, so this is not AI-generated video. Your images and audio stay on this device.
        </p>
      </div>

      <div className="video-layout">
        <div className="video-left">
          <VideoPreview board={board} video={video} seekRef={seekRef} />
          <ExportPanel board={board} video={video} onVideoChange={onVideoChange} />
        </div>

        <div className="video-right">
          <div className="tabs" role="tablist" aria-label="Video maker sections">
            {TABS.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  id={`vtab-${t.id}`}
                  aria-selected={tab === t.id}
                  aria-controls="vpanel"
                  className={`tab${tab === t.id ? ' is-active' : ''}`}
                  onClick={() => setTab(t.id)}
                >
                  <Icon size={15} aria-hidden="true" />
                  {t.label}
                </button>
              );
            })}
          </div>

          <div role="tabpanel" id="vpanel" aria-labelledby={`vtab-${tab}`} className="tab-panel">
            {tab === 'scenes' && (
              <>
                <div className="panel-bar">
                  <p className="muted small">
                    <strong>{imageCount}</strong> of {scenes.length} scenes have an image.
                  </p>
                  <div className="btn-row">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => bulkRef.current?.click()}>
                      <ImagePlus size={15} aria-hidden="true" />
                      Add several images
                    </button>
                    {ai.enabled && ai.key && missingIds.length ? (
                      <button type="button" className="btn btn-ghost btn-sm" disabled={batch?.running} onClick={() => runBatch(missingIds)}>
                        <Sparkles size={15} aria-hidden="true" />
                        Generate {missingIds.length} missing
                      </button>
                    ) : null}
                  </div>
                  <input
                    ref={bulkRef}
                    type="file"
                    accept={IMAGE_ACCEPT}
                    multiple
                    className="sr-only"
                    tabIndex={-1}
                    aria-hidden="true"
                    data-testid="bulk-image-input"
                    onChange={(e) => {
                      const files = e.target.files ? [...e.target.files] : [];
                      e.target.value = '';
                      handleBulk(files);
                    }}
                  />
                </div>
                <p className="field-hint hint-block">
                  <Info size={13} aria-hidden="true" />
                  <span>
                    Several images fill empty scenes in file-name order (01.jpg, 02.jpg…). Create images in any free
                    tool from each scene’s image prompt (copy it in the Storyboard tab){ai.enabled ? '' : ', or turn on AI images'}.
                    Scenes without an image show a titled placeholder card.
                  </span>
                </p>
                <ol className="media-list">
                  {scenes.map((scene, i) => (
                    <SceneMediaRow
                      key={scene.id}
                      scene={scene}
                      index={i}
                      count={scenes.length}
                      media={getSceneMedia(video, scene.id)}
                      captions={video.captions}
                      aspectRatio={settings.aspectRatio}
                      busy={busy[scene.id]}
                      error={errors[scene.id]}
                      aiEnabled={ai.enabled && !!ai.key}
                      onImageFile={(file) => placeImage(scene.id, file)}
                      onRemoveImage={() => removeImage(scene.id)}
                      onMoveImage={(dir) => moveImage(i, dir)}
                      onGenerate={() => generateForScene(scene.id)}
                      onPatch={(patch) => patchScene(scene.id, patch)}
                      onVoiceFile={(lane, file) => voiceFile(scene.id, lane, file)}
                      onClipChange={(lane, patch) => clipChange(scene.id, lane, patch)}
                      onClipRemove={(lane) => clipRemove(scene.id, lane)}
                      onPreview={() => seekRef.current?.(scene.startTime, true)}
                    />
                  ))}
                </ol>
              </>
            )}
            {tab === 'audio' && (
              <AudioPanel board={board} video={video} onVideoChange={onVideoChange} discardMedia={discardMedia} onJumpToScenes={() => setTab('scenes')} />
            )}
            {tab === 'captions' && <CaptionPanel board={board} video={video} onVideoChange={onVideoChange} />}
            {tab === 'ai' && (
              <AiImagePanel
                ai={ai}
                missingCount={missingIds.length}
                sceneCount={scenes.length}
                batch={batch}
                onEnable={() => {
                  updateAi({ enabled: true, consented: true });
                  announce(`AI images turned on. Image prompts will be sent to ${AI_PROVIDER.name} only when you generate.`);
                }}
                onDisable={() => {
                  batchAbort.current?.abort();
                  forgetAiData();
                  setAi({ enabled: false, consented: false, key: '', remember: false, model: '' });
                  announce('AI images turned off and your key was removed from this device.');
                }}
                onKeyChange={(key) => updateAi({ key })}
                onRememberChange={(remember) => updateAi({ remember })}
                onModelChange={(model) => updateAi({ model })}
                onGenerateMissing={() => runBatch(missingIds)}
                onGenerateAll={() => runBatch(scenes.map((s) => s.id))}
                onCancelBatch={() => batchAbort.current?.abort()}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
