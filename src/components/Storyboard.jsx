import { Check, FileJson, FileText, Info, LoaderCircle, RotateCcw, Scale, TriangleAlert, Upload } from 'lucide-react';
import CopyButton from './CopyButton.jsx';
import SceneCard from './SceneCard.jsx';
import Timeline from './Timeline.jsx';
import { GENRES, MAX_SCENE_DURATION, MIN_SCENE_DURATION, STYLES, sumDurations } from '../lib/storyEngine.js';
import { storyboardToText } from '../lib/format.js';

const TRANSITIONS = [
  'Cut', 'Hard cut', 'Match cut', 'Smash cut', 'Slow dissolve', 'Soft dissolve',
  'Cross-fade', 'Whip pan', 'Flicker cut', 'Slide', 'Fade to black', 'Fade to white',
];

export default function Storyboard({
  board,
  lockTotal,
  settingsChanged,
  saveInfo,
  exportingPdf,
  onFieldChange,
  onDurationChange,
  onToggleLock,
  onRebalance,
  onExportJson,
  onExportPdf,
  onImportClick,
  onReset,
}) {
  const { settings, scenes } = board;
  const total = sumDurations(scenes);
  const target = settings.duration;
  const derivedCount = scenes.filter((s) => s.isDerived).length;
  const styleLabel = STYLES[settings.style]?.label ?? settings.style;
  const genreLabel = GENRES[settings.genre]?.label ?? settings.genre;
  const maxDuration = lockTotal
    ? Math.min(MAX_SCENE_DURATION, total - MIN_SCENE_DURATION * (scenes.length - 1))
    : MAX_SCENE_DURATION;

  function jumpToScene(id) {
    const el = document.getElementById(`scene-${id}`);
    if (!el) return;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  }

  const savedTime = saveInfo.at
    ? new Date(saveInfo.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null;

  return (
    <section className="storyboard" aria-labelledby="storyboard-heading">
      <div className="section-head">
        <div>
          <h2 id="storyboard-heading" tabIndex={-1}>
            {settings.title || 'Untitled storyboard'}
          </h2>
          <ul className="chips" aria-label="Storyboard settings">
            <li>{styleLabel}</li>
            <li>{genreLabel}</li>
            <li>{settings.aspectRatio}</li>
            <li>{scenes.length} scenes</li>
            <li>{target}s target</li>
            <li>{settings.language}</li>
          </ul>
        </div>
        <div className="actions" role="group" aria-label="Storyboard actions">
          <CopyButton text={() => storyboardToText(board)} label="Copy all" srLabel="full storyboard" />
          <button type="button" className="btn btn-ghost btn-sm" onClick={onExportJson}>
            <FileJson size={15} aria-hidden="true" />
            Export JSON
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onExportPdf} disabled={exportingPdf}>
            {exportingPdf ? (
              <LoaderCircle size={15} className="spin" aria-hidden="true" />
            ) : (
              <FileText size={15} aria-hidden="true" />
            )}
            {exportingPdf ? 'Preparing PDF…' : 'Export PDF'}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onImportClick}>
            <Upload size={15} aria-hidden="true" />
            Import JSON
          </button>
          <button type="button" className="btn btn-danger btn-sm" onClick={onReset}>
            <RotateCcw size={15} aria-hidden="true" />
            Reset
          </button>
        </div>
      </div>

      <div className="notice notice-info">
        <Info size={18} aria-hidden="true" />
        <p>
          <strong>Template-generated, not AI-written.</strong> A rule-based engine split your story into beats and
          applied {styleLabel.toLowerCase()} style, {genreLabel.toLowerCase()} mood, and camera, audio and transition
          templates.{' '}
          {derivedCount > 0
            ? `${derivedCount} of ${scenes.length} scenes are generic “derived” beats because your story had fewer beats than scenes. Add more sentences, or edit those scenes for specific results.`
            : 'Every scene comes from your own story text. Review and refine the prompts before using them.'}
        </p>
      </div>

      {settingsChanged && (
        <div className="notice notice-warning">
          <TriangleAlert size={18} aria-hidden="true" />
          <p>
            Your form settings differ from this storyboard. Click <strong>Generate Storyboard</strong> to apply them.
            This replaces the current scenes.
          </p>
        </div>
      )}

      <Timeline scenes={scenes} target={target} onSelect={jumpToScene} />

      <div className="timeline-controls">
        <label className="toggle" htmlFor="lock-total">
          <input id="lock-total" type="checkbox" checked={lockTotal} onChange={onToggleLock} />
          <span>Lock total to {target}s</span>
        </label>
        <p className="field-hint">
          {lockTotal
            ? 'Changing one scene’s duration rebalances the others, so the total stays fixed.'
            : 'Durations change freely, and the total may drift from the target.'}
        </p>
        {total !== target && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onRebalance}>
            <Scale size={15} aria-hidden="true" />
            Rebalance to {target}s
          </button>
        )}
        <span className={`save-status${saveInfo.status === 'error' ? ' is-error' : ''}`}>
          {saveInfo.status === 'error' ? (
            <>
              <TriangleAlert size={14} aria-hidden="true" />
              Not saved in browser
            </>
          ) : saveInfo.status === 'saved' ? (
            <>
              <Check size={14} aria-hidden="true" />
              Saved in this browser{savedTime ? ` · ${savedTime}` : ''}
            </>
          ) : null}
        </span>
      </div>

      <datalist id="transition-options">
        {TRANSITIONS.map((t) => (
          <option key={t} value={t} />
        ))}
      </datalist>

      <ol className="scene-list" aria-label="Scenes">
        {scenes.map((scene) => (
          <li key={scene.id}>
            <SceneCard
              scene={scene}
              maxDuration={maxDuration}
              onFieldChange={onFieldChange}
              onDurationChange={onDurationChange}
            />
          </li>
        ))}
      </ol>
    </section>
  );
}
