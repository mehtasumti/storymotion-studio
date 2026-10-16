import { memo, useEffect, useState } from 'react';
import {
  ArrowRightLeft, Camera, Clock, FileText, Image as ImageIcon, MessageSquare, Mic, Minus, Music, Plus, Video,
} from 'lucide-react';
import CopyButton from './CopyButton.jsx';
import { formatTime, sceneToText } from '../lib/format.js';
import { MIN_SCENE_DURATION } from '../lib/storyEngine.js';

const FIELDS = [
  { field: 'description', label: 'Story beat', icon: FileText, rows: 2, wide: true, copy: false },
  { field: 'imagePrompt', label: 'Image prompt', icon: ImageIcon, rows: 6 },
  { field: 'animationPrompt', label: 'Animation prompt (image-to-video)', icon: Video, rows: 6 },
  { field: 'camera', label: 'Camera direction', icon: Camera, rows: 2 },
  { field: 'transition', label: 'Transition to next scene', icon: ArrowRightLeft, single: true, copy: false },
  {
    field: 'dialogue',
    label: 'Dialogue',
    icon: MessageSquare,
    rows: 2,
    placeholder: 'No quoted dialogue in your story for this beat. Add lines here if the scene needs them.',
  },
  { field: 'voiceover', label: 'Voiceover', icon: Mic, rows: 2, placeholder: 'Optional narration for this scene.' },
  {
    field: 'soundEffects',
    label: 'Music & sound effects',
    icon: Music,
    rows: 2,
    wide: true,
    hint: 'Template suggestion. Adjust it to your edit.',
  },
];

function SceneField({ sceneId, config, value, onChange }) {
  const { field, label, icon: Icon, rows = 3, wide, single, placeholder, hint, copy = true } = config;
  const id = `${field}-${sceneId}`;
  const hintId = hint ? `${id}-hint` : undefined;

  return (
    <div className={`scene-field${wide ? ' is-wide' : ''}`}>
      <div className="scene-field-head">
        <label htmlFor={id}>
          <Icon size={15} aria-hidden="true" />
          {label}
        </label>
        {copy && <CopyButton text={value} compact srLabel={label.toLowerCase()} />}
      </div>
      {single ? (
        <input
          id={id}
          type="text"
          list="transition-options"
          value={value}
          maxLength={200}
          onChange={(e) => onChange(field, e.target.value)}
          aria-describedby={hintId}
        />
      ) : (
        <textarea
          id={id}
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(field, e.target.value)}
          aria-describedby={hintId}
        />
      )}
      {hint && (
        <p id={hintId} className="field-hint">
          {hint}
        </p>
      )}
    </div>
  );
}

function SceneCard({ scene, maxDuration, onFieldChange, onDurationChange }) {
  const [durationDraft, setDurationDraft] = useState(String(scene.duration));

  useEffect(() => {
    setDurationDraft(String(scene.duration));
  }, [scene.duration]);

  const change = (field, value) => onFieldChange(scene.id, field, value);

  function commitDuration() {
    const value = parseInt(durationDraft, 10);
    if (Number.isFinite(value) && value !== scene.duration) onDurationChange(scene.id, value);
    else setDurationDraft(String(scene.duration));
  }

  const n = scene.sceneNumber;

  return (
    <article
      id={`scene-${scene.id}`}
      className={`scene-card${scene.isDerived ? ' is-derived' : ''}`}
      tabIndex={-1}
      aria-labelledby={`scene-heading-${scene.id}`}
    >
      <h3 id={`scene-heading-${scene.id}`} className="sr-only">
        {scene.title}
      </h3>

      <header className="scene-head">
        <div className="scene-num" aria-hidden="true">
          {n}
        </div>

        <div className="scene-head-main">
          <label className="sr-only" htmlFor={`title-${scene.id}`}>
            Scene {n} title
          </label>
          <input
            id={`title-${scene.id}`}
            type="text"
            className="scene-title-input"
            value={scene.title}
            maxLength={200}
            onChange={(e) => change('title', e.target.value)}
          />
          <div className="scene-meta">
            <span className="time-pill">
              <Clock size={14} aria-hidden="true" />
              {formatTime(scene.startTime)}–{formatTime(scene.endTime)}
            </span>
            <span
              className={`badge ${scene.isDerived ? 'badge-derived' : 'badge-story'}`}
              title={
                scene.isDerived
                  ? 'A generic beat created from your story to fill the scene count. Edit it to add specifics.'
                  : 'Built from your own story text.'
              }
            >
              {scene.isDerived ? 'Derived beat' : 'From your story'}
            </span>
          </div>
        </div>

        <div className="duration-control" role="group" aria-label={`Scene ${n} duration`}>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onDurationChange(scene.id, scene.duration - 1)}
            disabled={scene.duration <= MIN_SCENE_DURATION}
            aria-label={`Decrease scene ${n} duration by 1 second`}
          >
            <Minus size={16} aria-hidden="true" />
          </button>
          <label className="sr-only" htmlFor={`duration-${scene.id}`}>
            Scene {n} duration in seconds
          </label>
          <input
            id={`duration-${scene.id}`}
            type="number"
            inputMode="numeric"
            min={MIN_SCENE_DURATION}
            max={maxDuration}
            step={1}
            value={durationDraft}
            title={`Between ${MIN_SCENE_DURATION} and ${maxDuration} seconds`}
            onChange={(e) => setDurationDraft(e.target.value)}
            onBlur={commitDuration}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitDuration();
              }
            }}
          />
          <span className="unit" aria-hidden="true">
            s
          </span>
          <button
            type="button"
            className="icon-btn"
            onClick={() => onDurationChange(scene.id, scene.duration + 1)}
            disabled={scene.duration >= maxDuration}
            aria-label={`Increase scene ${n} duration by 1 second`}
          >
            <Plus size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      <div className="scene-fields">
        {FIELDS.map((config) => (
          <SceneField
            key={config.field}
            sceneId={scene.id}
            config={config}
            value={scene[config.field] ?? ''}
            onChange={change}
          />
        ))}
      </div>

      <div className="scene-foot">
        <CopyButton text={() => sceneToText(scene)} label="Copy scene" srLabel={`scene ${n}`} />
      </div>
    </article>
  );
}

export default memo(SceneCard);
