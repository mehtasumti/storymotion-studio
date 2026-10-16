import { memo, useRef, useState } from 'react';
import {
  ArrowDown, ArrowUp, Camera, CircleAlert, ImagePlus, LoaderCircle, Mic, Play, RefreshCw, RotateCcw, Sparkles,
  Trash2, Type, Upload,
} from 'lucide-react';
import { useMediaUrl } from './useMedia.js';
import { formatTime } from '../../lib/format.js';
import { IMAGE_ACCEPT, AUDIO_ACCEPT } from '../../lib/video/mediaFiles.js';
import { MOTIONS, autoMotion, captionTextFor } from '../../lib/video/videoModel.js';

function ClipControl({ sceneId, lane, label, clip, sceneDuration, busy, onFile, onChange, onRemove }) {
  const inputRef = useRef(null);
  const id = `${lane}-${sceneId}`;
  return (
    <div className="clip-row">
      <div className="clip-head">
        <span className="clip-label">
          <Mic size={14} aria-hidden="true" />
          {label}
        </span>
        <button
          type="button"
          className="btn btn-ghost btn-xs"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          aria-label={`${clip ? 'Replace' : 'Upload'} ${label.toLowerCase()} audio for this scene`}
        >
          {busy ? <LoaderCircle size={13} className="spin" aria-hidden="true" /> : <Upload size={13} aria-hidden="true" />}
          {clip ? 'Replace' : 'Upload'}
        </button>
        {clip && (
          <button
            type="button"
            className="icon-btn icon-btn-xs"
            onClick={onRemove}
            aria-label={`Remove ${label.toLowerCase()} audio`}
            title="Remove"
          >
            <Trash2 size={13} aria-hidden="true" />
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          accept={AUDIO_ACCEPT}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          data-testid={`${lane}-input-${sceneId}`}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) onFile(file);
          }}
        />
      </div>
      {clip ? (
        <div className="clip-body">
          <p className="clip-name" title={clip.name}>
            {clip.name} · {clip.duration.toFixed(1)}s
            {clip.stopAtSceneEnd !== false && clip.duration + (clip.offset || 0) > sceneDuration ? (
              <span className="clip-warn"> · trimmed at scene end</span>
            ) : null}
          </p>
          <div className="clip-controls">
            <label htmlFor={`${id}-vol`}>Volume</label>
            <input
              id={`${id}-vol`}
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={clip.volume ?? 1}
              onChange={(e) => onChange({ volume: Number(e.target.value) })}
            />
            <output htmlFor={`${id}-vol`}>{Math.round((clip.volume ?? 1) * 100)}%</output>
            <label htmlFor={`${id}-off`}>Starts after</label>
            <input
              id={`${id}-off`}
              type="number"
              min="0"
              max={Math.max(0, sceneDuration - 0.5)}
              step="0.1"
              value={clip.offset ?? 0}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (Number.isFinite(v)) onChange({ offset: Math.max(0, Math.min(sceneDuration - 0.1, v)) });
              }}
            />
            <span className="unit">s</span>
          </div>
          <label className="mini-check">
            <input
              type="checkbox"
              checked={clip.stopAtSceneEnd === false}
              onChange={(e) => onChange({ stopAtSceneEnd: !e.target.checked })}
            />
            Let it continue into the next scenes
          </label>
        </div>
      ) : null}
    </div>
  );
}

function SceneMediaRow({
  scene,
  index,
  count,
  media,
  captions,
  aspectRatio,
  busy,
  error,
  aiEnabled,
  onImageFile,
  onRemoveImage,
  onMoveImage,
  onGenerate,
  onPatch,
  onVoiceFile,
  onClipChange,
  onClipRemove,
  onPreview,
}) {
  const fileRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);
  const { url, missing } = useMediaUrl(media.imageId);
  const auto = autoMotion(scene.camera);
  const captionValue = captionTextFor(scene, { ...media, caption: media.caption }, { ...captions, uppercase: false });
  const custom = media.caption != null;
  const imageBusy = busy?.image;
  const n = scene.sceneNumber;

  function onDrop(e) {
    e.preventDefault();
    setDragOver(false);
    const file = [...(e.dataTransfer?.files || [])].find((f) => f.type.startsWith('image/'));
    if (file) onImageFile(file);
  }

  return (
    <li className={`media-row${scene.isDerived ? ' is-derived' : ''}`} id={`media-${scene.id}`}>
      <div className="media-row-head">
        <span className="scene-num scene-num-sm" aria-hidden="true">
          {n}
        </span>
        <div className="media-row-title">
          <h4>{scene.title}</h4>
          <span className="time-pill">
            {formatTime(scene.startTime)}–{formatTime(scene.endTime)} · {scene.duration}s
          </span>
        </div>
        <button type="button" className="icon-btn" onClick={onPreview} aria-label={`Preview scene ${n}`} title="Preview this scene">
          <Play size={15} aria-hidden="true" />
        </button>
      </div>

      <div className="media-row-body">
        <div
          className={`thumb thumb-${aspectRatio === '16:9' ? 'wide' : 'tall'}${dragOver ? ' is-drag' : ''}${url ? ' has-image' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          {imageBusy ? (
            <span className="thumb-state">
              <LoaderCircle size={22} className="spin" aria-hidden="true" />
              {imageBusy === 'generating' ? 'Generating…' : 'Processing…'}
            </span>
          ) : url ? (
            <img src={url} alt={`Scene ${n} image${media.imageSource === 'ai' ? ' (AI-generated)' : ''}`} />
          ) : missing ? (
            <span className="thumb-state thumb-missing">
              <CircleAlert size={20} aria-hidden="true" />
              Image not in this browser — upload again
            </span>
          ) : (
            <button type="button" className="thumb-empty" onClick={() => fileRef.current?.click()}>
              <ImagePlus size={22} aria-hidden="true" />
              <span>Add image</span>
              <span className="thumb-hint">or drop a file here</span>
            </button>
          )}
          {media.imageSource === 'ai' && url && !imageBusy ? <span className="thumb-badge">AI image</span> : null}
        </div>

        <div className="media-row-controls">
          <div className="btn-row">
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => fileRef.current?.click()} disabled={!!imageBusy}>
              <Upload size={14} aria-hidden="true" />
              {media.imageId ? 'Replace' : 'Upload'}
            </button>
            {aiEnabled && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={onGenerate} disabled={!!imageBusy}>
                {media.imageId ? <RefreshCw size={14} aria-hidden="true" /> : <Sparkles size={14} aria-hidden="true" />}
                {media.imageId ? 'Regenerate' : 'Generate'}
              </button>
            )}
            {media.imageId && (
              <button
                type="button"
                className="icon-btn"
                onClick={onRemoveImage}
                disabled={!!imageBusy}
                aria-label={`Remove scene ${n} image`}
                title="Remove image"
              >
                <Trash2 size={15} aria-hidden="true" />
              </button>
            )}
            <span className="btn-row-gap" />
            <button
              type="button"
              className="icon-btn"
              onClick={() => onMoveImage(-1)}
              disabled={index === 0 || !!imageBusy}
              aria-label={`Move scene ${n} image to scene ${n - 1}`}
              title="Swap image with previous scene"
            >
              <ArrowUp size={15} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => onMoveImage(1)}
              disabled={index === count - 1 || !!imageBusy}
              aria-label={`Move scene ${n} image to scene ${n + 1}`}
              title="Swap image with next scene"
            >
              <ArrowDown size={15} aria-hidden="true" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept={IMAGE_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              data-testid={`image-input-${scene.id}`}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (file) onImageFile(file);
              }}
            />
          </div>

          {error ? (
            <div className="inline-error" role="alert">
              <CircleAlert size={15} aria-hidden="true" />
              <span>{error.message}</span>
              {error.retry ? (
                <button type="button" className="btn btn-ghost btn-xs" onClick={error.retry}>
                  <RefreshCw size={13} aria-hidden="true" />
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}

          <div className="field compact-field">
            <label className="mini-label" htmlFor={`motion-${scene.id}`}>
              <Camera size={14} aria-hidden="true" />
              Camera animation
            </label>
            <select
              id={`motion-${scene.id}`}
              value={media.motion || 'auto'}
              onChange={(e) => onPatch({ motion: e.target.value })}
            >
              <option value="auto">Auto from camera notes: {MOTIONS[auto].label}</option>
              {Object.entries(MOTIONS).map(([key, m]) => (
                <option key={key} value={key}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="field compact-field">
            <div className="label-row">
              <label className="mini-label" htmlFor={`caption-${scene.id}`}>
                <Type size={14} aria-hidden="true" />
                Caption {custom ? <span className="optional">(edited)</span> : <span className="optional">(from storyboard)</span>}
              </label>
              {custom && (
                <button type="button" className="link-btn" onClick={() => onPatch({ caption: null })}>
                  <RotateCcw size={12} aria-hidden="true" />
                  Use storyboard text
                </button>
              )}
            </div>
            <textarea
              id={`caption-${scene.id}`}
              rows={2}
              value={captionValue}
              maxLength={2000}
              placeholder="No caption for this scene. Type one to show it on screen."
              onChange={(e) => onPatch({ caption: e.target.value })}
            />
          </div>
        </div>
      </div>

      <details className="voice-details">
        <summary>
          Voice clips for this scene
          {media.narration || media.dialogue ? (
            <span className="summary-badge">{[media.narration && 'narration', media.dialogue && 'dialogue'].filter(Boolean).join(' + ')}</span>
          ) : (
            <span className="optional"> (optional)</span>
          )}
        </summary>
        <ClipControl
          sceneId={scene.id}
          lane="narration"
          label="Narration"
          clip={media.narration}
          sceneDuration={scene.duration}
          busy={busy?.narration}
          onFile={(f) => onVoiceFile('narration', f)}
          onChange={(patch) => onClipChange('narration', patch)}
          onRemove={() => onClipRemove('narration')}
        />
        <ClipControl
          sceneId={scene.id}
          lane="dialogue"
          label="Dialogue"
          clip={media.dialogue}
          sceneDuration={scene.duration}
          busy={busy?.dialogue}
          onFile={(f) => onVoiceFile('dialogue', f)}
          onChange={(patch) => onClipChange('dialogue', patch)}
          onRemove={() => onClipRemove('dialogue')}
        />
        <p className="field-hint">Clips start when this scene starts (plus the delay you set) and stay in sync with the timeline.</p>
      </details>
    </li>
  );
}

export default memo(SceneMediaRow);
